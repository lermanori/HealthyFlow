import Capacitor
import Foundation
import Security

/// A random ID that names this iPhone to HealthyFlow's Admin (#308, ADR-0027).
///
/// Kept in the Keychain as a this-device-only item: it survives deleting and
/// reinstalling the app, is never synced through iCloud Keychain, and is never
/// restored onto another phone. It is not the advertising identifier, is not
/// derived from any hardware property, and no grant reads it.
@objc(DeviceIdentityPlugin)
public class DeviceIdentityPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DeviceIdentityPlugin"
    public let jsName = "DeviceIdentity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise)
    ]

    private let service = "app.healthyflow.mobile.device-identity"
    private let account = "device-id"

    @objc func get(_ call: CAPPluginCall) {
        do {
            call.resolve(["id": try readOrCreate()])
        } catch {
            call.reject("Could not read the device ID: \(error.localizedDescription)")
        }
    }

    private func readOrCreate() throws -> String {
        if let existing = try read() {
            return existing
        }
        let created = UUID().uuidString.lowercased()
        let status = SecItemAdd(attributes(for: created) as CFDictionary, nil)
        if status == errSecDuplicateItem, let existing = try read() {
            // Another call stored one first; that one is the device's ID.
            return existing
        }
        guard status == errSecSuccess else {
            throw DeviceIdentityError(status: status)
        }
        return created
    }

    private func read() throws -> String? {
        var query = itemQuery()
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        if status == errSecItemNotFound {
            return nil
        }
        guard status == errSecSuccess, let data = item as? Data, let id = String(data: data, encoding: .utf8) else {
            throw DeviceIdentityError(status: status)
        }
        return id
    }

    private func attributes(for id: String) -> [String: Any] {
        var attributes = itemQuery()
        attributes[kSecValueData as String] = Data(id.utf8)
        attributes[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        return attributes
    }

    private func itemQuery() -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecAttrSynchronizable as String: false
        ]
    }
}

struct DeviceIdentityError: LocalizedError {
    let status: OSStatus
    var errorDescription: String? { "Keychain status \(status)" }
}
