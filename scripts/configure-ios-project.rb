#!/usr/bin/env ruby

require "xcodeproj"

project_path = File.expand_path("../ios/App/App.xcodeproj", __dir__)
project = Xcodeproj::Project.open(project_path)
app_target = project.targets.find { |target| target.name == "App" }
abort "App target not found" unless app_target

app_group = project.main_group.find_subpath("App", false)
abort "App group not found" unless app_group

["HealthyFlowViewController.swift", "HealthyFlowWidgetPlugin.swift", "AppleSignInPlugin.swift"].each do |filename|
  reference = app_group.files.find { |file| file.path == filename } || app_group.new_file(filename)
  unless app_target.source_build_phase.files_references.include?(reference)
    app_target.source_build_phase.add_file_reference(reference)
  end
end

app_target.build_configurations.each do |configuration|
  configuration.build_settings["IPHONEOS_DEPLOYMENT_TARGET"] = "17.0"
end

target_attributes = project.root_object.attributes["TargetAttributes"] ||= {}
app_attributes = target_attributes[app_target.uuid] ||= {}
system_capabilities = app_attributes["SystemCapabilities"] ||= {}
system_capabilities["com.apple.SignInWithApple"] = { "enabled" => 1 }

widget_target = project.targets.find { |target| target.name == "HealthyFlowWidget" }
unless widget_target
  widget_target = project.new_target(:app_extension, "HealthyFlowWidget", :ios, "17.0")
end

widget_group = project.main_group.find_subpath("HealthyFlowWidget", true)
widget_group.path = "HealthyFlowWidget"
widget_group.source_tree = "<group>"
widget_source = widget_group.files.find { |file| file.path == "HealthyFlowWidget.swift" } ||
  widget_group.new_file("HealthyFlowWidget.swift")
unless widget_target.source_build_phase.files_references.include?(widget_source)
  widget_target.source_build_phase.add_file_reference(widget_source)
end

widget_info = widget_group.files.find { |file| file.path == "Info.plist" } ||
  widget_group.new_file("Info.plist")
widget_entitlements = widget_group.files.find { |file| file.path == "HealthyFlowWidget.entitlements" } ||
  widget_group.new_file("HealthyFlowWidget.entitlements")

app_settings_by_configuration = app_target.build_configurations.to_h do |configuration|
  [configuration.name, configuration.build_settings]
end

widget_target.build_configurations.each do |configuration|
  settings = configuration.build_settings
  app_settings = app_settings_by_configuration.fetch(configuration.name, {})
  settings["APPLICATION_EXTENSION_API_ONLY"] = "YES"
  settings["CODE_SIGN_ENTITLEMENTS"] = "HealthyFlowWidget/HealthyFlowWidget.entitlements"
  settings["CODE_SIGN_STYLE"] = "Automatic"
  settings["CURRENT_PROJECT_VERSION"] = app_settings["CURRENT_PROJECT_VERSION"] || "1"
  settings["GENERATE_INFOPLIST_FILE"] = "NO"
  settings["INFOPLIST_FILE"] = "HealthyFlowWidget/Info.plist"
  settings["IPHONEOS_DEPLOYMENT_TARGET"] = "17.0"
  settings["MARKETING_VERSION"] = app_settings["MARKETING_VERSION"] || "1.0"
  settings["PRODUCT_BUNDLE_IDENTIFIER"] = "app.healthyflow.mobile.widget"
  settings["PRODUCT_NAME"] = "$(TARGET_NAME)"
  settings["SKIP_INSTALL"] = "YES"
  settings["SWIFT_VERSION"] = "5.0"
  settings["TARGETED_DEVICE_FAMILY"] = "1,2"
end

unless app_target.dependencies.any? { |dependency| dependency.target == widget_target }
  app_target.add_dependency(widget_target)
end

embed_phase = app_target.copy_files_build_phases.find { |phase| phase.name == "Embed App Extensions" }
unless embed_phase
  embed_phase = app_target.new_copy_files_build_phase("Embed App Extensions")
  embed_phase.symbol_dst_subfolder_spec = :plug_ins
end
unless embed_phase.files_references.include?(widget_target.product_reference)
  build_file = embed_phase.add_file_reference(widget_target.product_reference, true)
  build_file.settings = { "ATTRIBUTES" => ["CodeSignOnCopy", "RemoveHeadersOnCopy"] }
end

# Keep these references visible in Xcode even though build settings own them.
widget_info
widget_entitlements

project.save
