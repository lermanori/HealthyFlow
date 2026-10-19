import AVFoundation

// Shared with the native regression harness. Only an authorized result may
// present the system camera; denial must never open a blank capture screen.
@MainActor
func authorizeCameraCapture(
    status: AVAuthorizationStatus,
    requestAccess: () async -> Bool,
    presentCamera: () -> Void,
    accessDenied: () -> Void,
    accessRestricted: () -> Void
) async {
    switch status {
    case .authorized:
        presentCamera()
    case .notDetermined:
        if await requestAccess() { presentCamera() } else { accessDenied() }
    case .denied:
        accessDenied()
    case .restricted:
        accessRestricted()
    @unknown default:
        accessRestricted()
    }
}

#if os(iOS)
import Capacitor
import PhotosUI
import UniformTypeIdentifiers

@objc(TalkAttachmentsPlugin)
public final class TalkAttachmentsPlugin: CAPPlugin, CAPBridgedPlugin,
    UIImagePickerControllerDelegate, UINavigationControllerDelegate,
    PHPickerViewControllerDelegate, UIDocumentPickerDelegate,
    UIAdaptivePresentationControllerDelegate {
    public let identifier = "TalkAttachmentsPlugin"
    public let jsName = "TalkAttachments"
    public let pluginMethods: [CAPPluginMethod] = [CAPPluginMethod(name: "choose", returnType: CAPPluginReturnPromise)]
    private var pendingCall: CAPPluginCall?
    private var isContinuingFromAttachmentMenu = false

    @objc func choose(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard self.pendingCall == nil else {
                call.reject("An attachment picker is already open.")
                return
            }
            self.pendingCall = call
            self.isContinuingFromAttachmentMenu = false
            let menu = UIAlertController(title: "Attach to Talk", message: nil, preferredStyle: .actionSheet)
            menu.addAction(UIAlertAction(title: "Take Photo", style: .default) { [weak menu] _ in
                self.isContinuingFromAttachmentMenu = true
                // This dismissal continues the same attachment request. Detach
                // the cancellation delegate before transitioning to the picker.
                menu?.presentationController?.delegate = nil
                menu?.dismiss(animated: true) { self.takePhoto() }
            })
            menu.addAction(UIAlertAction(title: "Choose Photo", style: .default) { [weak menu] _ in
                self.isContinuingFromAttachmentMenu = true
                menu?.presentationController?.delegate = nil
                menu?.dismiss(animated: true) { self.choosePhoto() }
            })
            menu.addAction(UIAlertAction(title: "Choose File", style: .default) { [weak menu] _ in
                self.isContinuingFromAttachmentMenu = true
                menu?.presentationController?.delegate = nil
                menu?.dismiss(animated: true) { self.chooseFile() }
            })
            menu.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in self.cancel() })
            self.present(menu)
        }
    }

    @MainActor
    private func present(_ controller: UIViewController) {
        guard let host = bridge?.viewController, host.presentedViewController == nil else {
            fail("Could not open the attachment picker. Close the current dialog and try again.")
            return
        }
        // Action sheets must have a popover anchor on iPad.
        if let popover = controller.popoverPresentationController {
            popover.sourceView = host.view
            popover.sourceRect = CGRect(x: host.view.bounds.midX, y: host.view.bounds.maxY - 80, width: 1, height: 1)
            popover.permittedArrowDirections = []
        }
        // Only the attachment menu needs generic dismissal tracking. Each
        // picker reports selection and cancellation through its own delegate;
        // observing its dismissal would cancel a successful selection.
        if let alert = controller as? UIAlertController, alert.preferredStyle == .actionSheet {
            controller.presentationController?.delegate = self
        }
        host.present(controller, animated: true)
    }

    @MainActor
    private func takePhoto() {
        Task { @MainActor in
            await authorizeCameraCapture(
                status: AVCaptureDevice.authorizationStatus(for: .video),
                requestAccess: { await AVCaptureDevice.requestAccess(for: .video) },
                presentCamera: {
                    guard UIImagePickerController.isSourceTypeAvailable(.camera) else {
                        self.fail("A camera is not available on this device.")
                        return
                    }
                    let picker = UIImagePickerController()
                    picker.sourceType = .camera
                    picker.mediaTypes = [UTType.image.identifier]
                    picker.delegate = self
                    picker.modalPresentationStyle = .fullScreen
                    self.present(picker)
                },
                accessDenied: { self.showCameraDenied() },
                accessRestricted: {
                    self.fail("Camera access is restricted on this device. You can still choose an existing photo or file.")
                }
            )
        }
    }

    @MainActor
    private func showCameraDenied() {
        let alert = UIAlertController(
            title: "Camera access is off",
            message: "Enable Camera in Settings to take a photo. You can still choose an existing photo or file.",
            preferredStyle: .alert
        )
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in self.cancel() })
        alert.addAction(UIAlertAction(title: "Open Settings", style: .default) { _ in
            guard let url = URL(string: UIApplication.openSettingsURLString) else {
                self.fail("Could not open Settings.")
                return
            }
            UIApplication.shared.open(url, options: [:]) { opened in
                if opened { self.cancel() } else { self.fail("Could not open Settings. Open Settings > Apps > HealthyFlow manually.") }
            }
        })
        present(alert)
    }

    @MainActor
    private func choosePhoto() {
        // The system picker grants access to the selected photo only. This does
        // not request camera permission or broad photo-library access.
        var configuration = PHPickerConfiguration()
        configuration.filter = .images
        configuration.selectionLimit = 1
        let picker = PHPickerViewController(configuration: configuration)
        picker.delegate = self
        present(picker)
    }

    @MainActor
    private func chooseFile() {
        let types: [UTType] = [.jpeg, .png, .webP, .plainText, UTType(filenameExtension: "md") ?? .text]
        let picker = UIDocumentPickerViewController(forOpeningContentTypes: types, asCopy: true)
        picker.delegate = self
        picker.allowsMultipleSelection = false
        present(picker)
    }

    public func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
        picker.dismiss(animated: true) { self.cancel() }
    }

    public func imagePickerController(_ picker: UIImagePickerController,
                                      didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
        let image = info[.originalImage] as? UIImage
        picker.dismiss(animated: true) {
            guard let image else { self.fail("Could not read the captured photo."); return }
            self.finishImage(image)
        }
    }

    public func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        picker.dismiss(animated: true) {
            guard let provider = results.first?.itemProvider else { self.cancel(); return }
            guard provider.canLoadObject(ofClass: UIImage.self) else {
                self.fail("This photo could not be read.")
                return
            }
            provider.loadObject(ofClass: UIImage.self) { image, error in
                DispatchQueue.main.async {
                    guard error == nil, let image = image as? UIImage else {
                        self.fail("Could not load the selected photo. Try downloading it to your device first.")
                        return
                    }
                    self.finishImage(image)
                }
            }
        }
    }

    public func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        cancel()
    }

    public func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard let url = urls.first else { cancel(); return }
        let access = url.startAccessingSecurityScopedResource()
        defer { if access { url.stopAccessingSecurityScopedResource() } }
        do {
            let mimeTypes = ["jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
                             "webp": "image/webp", "txt": "text/plain", "md": "text/markdown", "markdown": "text/markdown"]
            guard let mime = mimeTypes[url.pathExtension.lowercased()] else {
                fail("Attach a JPG, PNG, WebP, TXT, or MD file.")
                return
            }
            let limit = mime.hasPrefix("image/") ? 4 * 1024 * 1024 : 64 * 1024
            let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize
            guard let size, size <= limit else {
                fail(mime.hasPrefix("image/") ? "Image attachment must be 4MB or smaller." : "Text attachment must be 64KB or smaller.")
                return
            }
            let data = try Data(contentsOf: url)
            guard data.count <= limit else { fail("The selected file is too large."); return }
            finish(data, name: url.lastPathComponent, mimeType: mime)
        } catch {
            fail("Could not read the selected file: \(error.localizedDescription)")
        }
    }

    public func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
        let controller = presentationController.presentedViewController
        if let alert = controller as? UIAlertController,
           alert.preferredStyle == .actionSheet,
           isContinuingFromAttachmentMenu {
            isContinuingFromAttachmentMenu = false
            return
        }
        cancel()
    }

    private func finishImage(_ image: UIImage) {
        // Bound camera/HEIC photos before transferring them over the JS bridge.
        let ratio = min(1, 2048 / max(image.size.width, image.size.height))
        let size = CGSize(width: image.size.width * ratio, height: image.size.height * ratio)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let resized = UIGraphicsImageRenderer(size: size, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: size))
        }
        guard let data = resized.jpegData(compressionQuality: 0.85), data.count <= 4 * 1024 * 1024 else {
            fail("Could not prepare a photo within the 4MB attachment limit.")
            return
        }
        finish(data, name: "photo.jpg", mimeType: "image/jpeg")
    }

    private func finish(_ data: Data, name: String, mimeType: String) {
        let call = pendingCall
        pendingCall = nil
        call?.resolve(["status": "selected", "name": name, "mimeType": mimeType, "data": data.base64EncodedString()])
    }

    private func cancel() {
        let call = pendingCall
        pendingCall = nil
        call?.resolve(["status": "cancelled"])
    }

    private func fail(_ message: String) {
        let call = pendingCall
        pendingCall = nil
        call?.reject(message)
    }
}
#endif
