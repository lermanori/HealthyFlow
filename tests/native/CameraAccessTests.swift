import AVFoundation

@main
struct CameraAccessTests {
    @MainActor
    static func main() async {
        for (status, grant, expected) in [
            (AVAuthorizationStatus.authorized, false, ["camera"]),
            (.denied, true, ["denied"]),
            (.restricted, true, ["restricted"]),
            (.notDetermined, true, ["request", "camera"]),
            (.notDetermined, false, ["request", "denied"])
        ] {
            var events: [String] = []
            await authorizeCameraCapture(
                status: status,
                requestAccess: { events.append("request"); return grant },
                presentCamera: { events.append("camera") },
                accessDenied: { events.append("denied") },
                accessRestricted: { events.append("restricted") }
            )
            precondition(events == expected, "Unexpected camera flow: \(events), expected \(expected)")
        }
        print("Camera authorization: authorized, denied, restricted, first allow, first denial passed.")
    }
}
