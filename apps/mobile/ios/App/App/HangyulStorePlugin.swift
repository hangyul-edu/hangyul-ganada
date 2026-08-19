import Foundation
import Capacitor
import SQLite3

/// Where a learner's practice actually lives on iOS.
///
/// ## Why this exists at all
///
/// The web build keeps progress in IndexedDB. Inside a `WKWebView` that is
/// storage the app does not own: WebKit holds it in the website data store,
/// where it is subject to the same eviction policy as any site's data. Hangyul
/// GaNaDa has no account and no server, so the only copy of three weeks of
/// practice is the one on the phone. That copy belongs in Application Support,
/// which is backed up, restored onto a new device, and never evicted.
///
/// ## Why it is written here and not installed
///
/// The obvious choice is the community SQLite plugin, which brings SQLCipher,
/// biometric authentication and a keychain-backed key store into an app that
/// teaches the alphabet — every one of which has to be explained on a privacy
/// form for a feature this app does not have. `libsqlite3` has shipped in iOS
/// since iOS 2. Using it directly costs the lines below and adds no dependency.
///
/// ## The shape of the data
///
/// One table of `(store, key, value)`, matching the Android plugin byte for
/// byte, because the two of them implement the same `PersistenceDriver` and a
/// difference between them would surface as a bug that reproduces on one
/// platform only. The learner's *schema* is versioned by the web layer in
/// `apps/web/src/storage/schema.ts`, which already has ordered migrations and
/// tests; what this class guarantees is durability, not structure.
@objc(HangyulStorePlugin)
public class HangyulStorePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "HangyulStorePlugin"
    public let jsName = "HangyulStore"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "open", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getAll", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "put", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "putMany", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearStore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearAll", returnType: CAPPluginReturnPromise)
    ]

    private var database: OpaquePointer?
    /// Every call is serialised onto one queue. SQLite would tolerate more, but
    /// the app has exactly one writer and no read concurrency worth the risk of
    /// getting the threading subtly wrong.
    private let queue = DispatchQueue(label: "com.talkhangyul.ganada.store")

    /// `SQLITE_TRANSIENT`: tells SQLite to copy the bound string rather than
    /// hold the pointer. Swift's bridged `String` buffers do not outlive the
    /// call, and binding them as `STATIC` is the classic way to get data that
    /// is correct in a simulator and garbage on a device.
    private static let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

    // MARK: - Connection

    private func connect() throws -> OpaquePointer {
        if let database { return database }

        // Application Support, not Documents: this is data the app manages, not
        // files the learner created and would expect to see in the Files app.
        // Documents is also what iTunes/Finder file sharing exposes, and a
        // half-understood database is not a document.
        let support = try FileManager.default.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )
        let url = support.appendingPathComponent("hangyul.sqlite3")

        var handle: OpaquePointer?
        guard sqlite3_open_v2(
            url.path,
            &handle,
            SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_FULLMUTEX,
            nil
        ) == SQLITE_OK, let handle else {
            throw StoreError.message("could not open the practice database")
        }

        // Write-ahead logging: a crash or a force-quit mid-write leaves the
        // last committed state intact instead of a partially written page.
        sqlite3_exec(handle, "PRAGMA journal_mode = WAL", nil, nil, nil)
        sqlite3_exec(handle, "PRAGMA foreign_keys = ON", nil, nil, nil)
        try exec(
            """
            CREATE TABLE IF NOT EXISTS records (
              store TEXT NOT NULL,
              key   TEXT NOT NULL,
              value TEXT NOT NULL,
              PRIMARY KEY (store, key)
            ) WITHOUT ROWID
            """,
            on: handle
        )

        database = handle
        return handle
    }

    private enum StoreError: Error {
        case message(String)
    }

    private func exec(_ sql: String, on handle: OpaquePointer) throws {
        var error: UnsafeMutablePointer<CChar>?
        guard sqlite3_exec(handle, sql, nil, nil, &error) == SQLITE_OK else {
            let detail = error.map { String(cString: $0) } ?? "unknown"
            sqlite3_free(error)
            throw StoreError.message(detail)
        }
    }

    /// Runs `body` on the store's queue and turns a thrown error into a
    /// rejected promise, so no method below has to repeat the same do/catch.
    private func perform(_ call: CAPPluginCall, _ body: @escaping (OpaquePointer) throws -> Void) {
        queue.async {
            do {
                try body(self.connect())
            } catch StoreError.message(let detail) {
                call.reject(detail)
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    private func prepared(_ sql: String, on handle: OpaquePointer, _ binds: [String]) throws -> OpaquePointer {
        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(handle, sql, -1, &statement, nil) == SQLITE_OK, let statement else {
            throw StoreError.message(String(cString: sqlite3_errmsg(handle)))
        }
        for (index, value) in binds.enumerated() {
            sqlite3_bind_text(statement, Int32(index + 1), value, -1, Self.transient)
        }
        return statement
    }

    // MARK: - Methods

    @objc func open(_ call: CAPPluginCall) {
        perform(call) { handle in
            let path = String(cString: sqlite3_db_filename(handle, "main"))
            let bytes = (try? FileManager.default.attributesOfItem(atPath: path)[.size] as? Int) ?? 0
            // Reported so the app can show a learner where their practice lives
            // on the Privacy & Data screen, rather than asking them to take it
            // on trust.
            call.resolve(["path": path, "bytes": bytes ?? 0])
        }
    }

    @objc func get(_ call: CAPPluginCall) {
        guard let store = call.getString("store"), let key = call.getString("key") else {
            return call.reject("store and key are required")
        }
        perform(call) { handle in
            let statement = try self.prepared(
                "SELECT value FROM records WHERE store = ? AND key = ?", on: handle, [store, key]
            )
            defer { sqlite3_finalize(statement) }
            if sqlite3_step(statement) == SQLITE_ROW, let text = sqlite3_column_text(statement, 0) {
                call.resolve(["value": String(cString: text)])
            } else {
                call.resolve([:])
            }
        }
    }

    @objc func getAll(_ call: CAPPluginCall) {
        guard let store = call.getString("store") else {
            return call.reject("store is required")
        }
        perform(call) { handle in
            let statement = try self.prepared(
                "SELECT value FROM records WHERE store = ? ORDER BY key ASC", on: handle, [store]
            )
            defer { sqlite3_finalize(statement) }
            var values: [String] = []
            while sqlite3_step(statement) == SQLITE_ROW {
                if let text = sqlite3_column_text(statement, 0) {
                    values.append(String(cString: text))
                }
            }
            call.resolve(["values": values])
        }
    }

    @objc func put(_ call: CAPPluginCall) {
        guard
            let store = call.getString("store"),
            let key = call.getString("key"),
            let value = call.getString("value")
        else {
            return call.reject("store, key and value are required")
        }
        perform(call) { handle in
            let statement = try self.prepared(
                "INSERT OR REPLACE INTO records (store, key, value) VALUES (?, ?, ?)",
                on: handle, [store, key, value]
            )
            defer { sqlite3_finalize(statement) }
            guard sqlite3_step(statement) == SQLITE_DONE else {
                throw StoreError.message(String(cString: sqlite3_errmsg(handle)))
            }
            call.resolve()
        }
    }

    @objc func putMany(_ call: CAPPluginCall) {
        guard
            let store = call.getString("store"),
            let entries = call.getArray("entries") as? [[String: Any]]
        else {
            return call.reject("store and entries are required")
        }
        perform(call) { handle in
            // One transaction, not one per entry. A finished lesson writes an
            // attempt, a progress record and a day's roll-up together;
            // committing them separately means a crash between two of them
            // leaves the learner's record disagreeing with itself.
            try self.exec("BEGIN IMMEDIATE", on: handle)
            do {
                for entry in entries {
                    guard
                        let key = entry["key"] as? String,
                        let value = entry["value"] as? String
                    else {
                        throw StoreError.message("entries must be [{ key, value }]")
                    }
                    let statement = try self.prepared(
                        "INSERT OR REPLACE INTO records (store, key, value) VALUES (?, ?, ?)",
                        on: handle, [store, key, value]
                    )
                    defer { sqlite3_finalize(statement) }
                    guard sqlite3_step(statement) == SQLITE_DONE else {
                        throw StoreError.message(String(cString: sqlite3_errmsg(handle)))
                    }
                }
                try self.exec("COMMIT", on: handle)
                call.resolve()
            } catch {
                try? self.exec("ROLLBACK", on: handle)
                throw error
            }
        }
    }

    @objc func remove(_ call: CAPPluginCall) {
        guard let store = call.getString("store"), let key = call.getString("key") else {
            return call.reject("store and key are required")
        }
        perform(call) { handle in
            let statement = try self.prepared(
                "DELETE FROM records WHERE store = ? AND key = ?", on: handle, [store, key]
            )
            defer { sqlite3_finalize(statement) }
            sqlite3_step(statement)
            call.resolve()
        }
    }

    @objc func clearStore(_ call: CAPPluginCall) {
        guard let store = call.getString("store") else {
            return call.reject("store is required")
        }
        perform(call) { handle in
            let statement = try self.prepared("DELETE FROM records WHERE store = ?", on: handle, [store])
            defer { sqlite3_finalize(statement) }
            sqlite3_step(statement)
            call.resolve()
        }
    }

    @objc func clearAll(_ call: CAPPluginCall) {
        perform(call) { handle in
            // DELETE rather than DROP, so the table's shape is not something
            // that exists only when a learner has data.
            try self.exec("DELETE FROM records", on: handle)
            call.resolve()
        }
    }

    deinit {
        if let database { sqlite3_close_v2(database) }
    }
}
