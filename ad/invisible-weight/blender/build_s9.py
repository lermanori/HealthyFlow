# Build the S9 "organization" scene: scattered note cards converge into one
# clean timeline column, with shallow depth of field over the frozen H7 frame.
#
# Run headless:
#   blender -b -P build_s9.py            # builds scene + saves s9.blend
#   blender -b s9.blend -o //render/s9_ -a   # render PNG sequence
#
# Requires organize/textures/note_00.png..note_13.png, row_00..row_13.png,
# backdrop.png (see s9_config.json). Missing textures fall back to flat
# placeholder materials so you can block the motion before art is ready.

import json
import math
import random
from pathlib import Path

import bpy

HERE = Path(bpy.path.abspath("//")) if bpy.data.filepath else Path(__file__).parent
CFG = json.loads((HERE / "s9_config.json").read_text())
TEX = HERE.parent / "organize" / "textures"
FPS = CFG["fps"]
END = int(CFG["duration_s"] * FPS)


def clean_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.fps = FPS
    sc.frame_start, sc.frame_end = 1, END
    sc.render.resolution_x, sc.render.resolution_y = CFG["resolution"]
    engine_ids = {i.identifier for i in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items}
    sc.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in engine_ids else "BLENDER_EEVEE"
    sc.render.film_transparent = False
    return sc


def image_material(name, png, fallback_rgba, strength=1.0):
    # Shadeless: the card/backdrop art must render at its native brightness.
    # Principled + scene lights left everything several stops under.
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (0, 0, 0, 1)
    bsdf.inputs["Emission Strength"].default_value = strength
    if png.exists():
        tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
        tex.image = bpy.data.images.load(str(png))
        mat.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Emission Color"])
        mat.node_tree.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
        mat.blend_method = "BLEND"
    else:
        bsdf.inputs["Emission Color"].default_value = fallback_rgba
    return mat


def card_plane(name, size):
    bpy.ops.mesh.primitive_plane_add(size=1)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (size[0] / 2, size[1] / 2, 1)
    bpy.ops.object.transform_apply(scale=True)
    return obj


def action_fcurves(action):
    # Blender 5.x layered-action model: fcurves live under layers/strips/channelbags.
    for layer in action.layers:
        for strip in layer.strips:
            for channelbag in strip.channelbags:
                yield from channelbag.fcurves


def ease_keyframe(obj, path, frame):
    obj.keyframe_insert(data_path=path, frame=frame)
    for fc in action_fcurves(obj.animation_data.action):
        for kp in fc.keyframe_points:
            kp.interpolation = "BEZIER"
            kp.easing = "EASE_OUT"


def main():
    sc = clean_scene()
    rng = random.Random(CFG["scatter_seed"])
    sct, col, cam_cfg = CFG["scatter"], CFG["column"], CFG["camera"]

    # backdrop: the frozen H7 close-up, dimmed so the cards read
    bd = card_plane("backdrop", [CFG["backdrop"]["scale"] * 9 / 16, CFG["backdrop"]["scale"]])
    bd.location = (0, 0, CFG["backdrop"]["z"])
    bd.data.materials.append(image_material(
        "backdrop", TEX / "backdrop.png", (0.03, 0.07, 0.09, 1),
        strength=CFG["backdrop"]["dim_to"]))

    # camera with slow drift + shallow DOF
    bpy.ops.object.camera_add(location=cam_cfg["location"], rotation=(0, 0, 0))
    cam = bpy.context.active_object
    sc.camera = cam
    cam.data.dof.use_dof = True
    cam.data.dof.aperture_fstop = cam_cfg["fstop"]
    cam.data.dof.focus_distance = cam_cfg["location"][2] - cam_cfg["focus_z"]
    cam.keyframe_insert("location", frame=1)
    cam.location.z += cam_cfg["drift_z"]
    ease_keyframe(cam, "location", END)

    # soft key light
    bpy.ops.object.light_add(type="AREA", location=(2, -2, 5))
    bpy.context.active_object.data.energy = 400

    start_f = int(CFG["converge_start_s"] * FPS)
    dur_f = int(CFG["converge_dur_s"] * FPS)
    stagger_f = CFG["stagger_s"] * FPS

    for i, label in enumerate(CFG["rows"]):
        # scattered start pose
        sx = rng.uniform(-sct["x"], sct["x"])
        sy = rng.uniform(-sct["y"], sct["y"])
        sz = rng.uniform(sct["z_near"], sct["z_far"])
        rot = (rng.uniform(-0.2, 0.2), rng.uniform(-0.2, 0.2), rng.uniform(-0.25, 0.25))
        # final column pose
        tx, ty, tz = col["x"], col["top_y"] - i * col["row_gap"], col["z"]

        note = card_plane(f"note_{i:02d}", CFG["card_size"])
        note.data.materials.append(image_material(
            f"note_{i:02d}", TEX / f"note_{i:02d}.png", (0.96, 0.95, 0.92, 1)))
        row = card_plane(f"row_{i:02d}", CFG["card_size"])
        row.data.materials.append(image_material(
            f"row_{i:02d}", TEX / f"row_{i:02d}.png", (0.03, 0.07, 0.09, 1)))

        land_f = int(start_f + i * stagger_f + dur_f)

        # note card: scattered -> column, then hides as the row version takes over
        note.location, note.rotation_euler = (sx, sy, sz), rot
        note.keyframe_insert("location", frame=int(start_f + i * stagger_f))
        note.keyframe_insert("rotation_euler", frame=int(start_f + i * stagger_f))
        note.location, note.rotation_euler = (tx, ty, tz), (0, 0, 0)
        ease_keyframe(note, "location", land_f)
        ease_keyframe(note, "rotation_euler", land_f)
        for obj, visible_after in ((note, False), (row, True)):
            obj.hide_render = obj.hide_viewport = visible_after
            obj.keyframe_insert("hide_render", frame=land_f - 1)
            obj.keyframe_insert("hide_viewport", frame=land_f - 1)
            obj.hide_render = obj.hide_viewport = not visible_after
            obj.keyframe_insert("hide_render", frame=land_f)
            obj.keyframe_insert("hide_viewport", frame=land_f)
        row.location = (tx, ty, tz)

    bpy.ops.wm.save_as_mainfile(filepath=str(HERE / "s9.blend"))
    print(f"saved {HERE / 's9.blend'} — {len(CFG['rows'])} notes, "
          f"{CFG['duration_s']}s, converge {CFG['converge_start_s']}s+{CFG['converge_dur_s']}s")


main()
