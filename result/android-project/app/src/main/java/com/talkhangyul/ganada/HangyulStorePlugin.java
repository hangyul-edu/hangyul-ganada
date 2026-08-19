package com.talkhangyul.ganada;

import android.content.ContentValues;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import android.content.Context;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Where a learner's practice actually lives on Android.
 *
 * <h2>Why this exists at all</h2>
 *
 * The web build keeps progress in IndexedDB, which is fine in a browser. Inside
 * a WebView it is storage the app does not own: it sits in the WebView's data
 * directory, it is what "Clear cache" and a WebView update touch first, and on
 * a device running low on space it is among the first things the system is
 * willing to evict. Hangyul GaNaDa has no account and no server, so the only
 * copy of three weeks of practice is the one on the phone. That copy belongs in
 * the app's own database directory, where it survives an app update, a reboot,
 * and a WebView upgrade, and where Android's backup rules can carry it to a new
 * device.
 *
 * <h2>Why it is written here and not installed</h2>
 *
 * The obvious choice is the community SQLite plugin. It brings SQLCipher's
 * native libraries, Room, {@code androidx.security-crypto} and
 * {@code androidx.biometric} — and with them a {@code USE_BIOMETRIC} permission
 * in the merged manifest of an app that teaches the alphabet. Every one of
 * those has to be explained to a store reviewer and to a customer reading the
 * data-safety form, for features this app does not have and will not add.
 *
 * Android has shipped SQLite in the platform since API 1. Using it directly
 * costs the ~120 lines below, adds no dependency, adds no permission, and adds
 * no {@code .so} file — which is also why this app is 16 KB page-size
 * compatible without doing anything: it has no native libraries to re-align.
 *
 * <h2>The shape of the data</h2>
 *
 * One table of {@code (store, key, value)}, not a table per store. The web
 * layer's {@code PersistenceDriver} is a keyed-collection interface precisely so
 * that IndexedDB, SQLite and a plain Map can all implement it honestly, and
 * modelling the learner's schema twice — once in TypeScript migrations and once
 * in DDL — would mean two places to get a migration wrong. Schema evolution
 * stays where it already is and is already tested: in
 * {@code apps/web/src/storage/schema.ts}. What this class guarantees is
 * durability, not structure.
 *
 * Values arrive as JSON text. Bridging typed objects through {@code JSObject}
 * would re-encode numbers and lose {@code undefined} in ways the IndexedDB
 * driver does not, and a driver that behaved differently per platform would
 * turn every storage bug into a platform bug.
 */
@CapacitorPlugin(name = "HangyulStore")
public class HangyulStorePlugin extends Plugin {

    /** Every call is dispatched on Capacitor's background thread, so this is
     *  never touched from the UI thread. */
    private Helper helper;

    private static final String TABLE = "records";

    private static class Helper extends SQLiteOpenHelper {

        /**
         * Version 1, and expected to stay there.
         *
         * This is the *container's* version. The learner's schema is versioned
         * separately by the web layer, which reads and writes the {@code meta}
         * store and runs its own ordered migrations. Bumping this number would
         * only ever be for a change to the three columns below.
         */
        Helper(Context context) {
            super(context, "hangyul.db", null, 1);
        }

        @Override
        public void onCreate(SQLiteDatabase db) {
            // WITHOUT ROWID: the primary key *is* the row, and every read this
            // app makes is either an exact (store, key) hit or a full scan of
            // one store. There is no secondary index to keep, so the extra
            // rowid indirection would buy nothing.
            db.execSQL(
                "CREATE TABLE IF NOT EXISTS " + TABLE + " (" +
                "  store TEXT NOT NULL," +
                "  key   TEXT NOT NULL," +
                "  value TEXT NOT NULL," +
                "  PRIMARY KEY (store, key)" +
                ") WITHOUT ROWID"
            );
        }

        @Override
        public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
            // Nothing to do yet, and deliberately not a drop-and-recreate: the
            // default implementation of that idiom is how apps lose data on
            // update. If this table ever changes shape, it changes by ALTER.
        }
    }

    private SQLiteDatabase db() {
        if (helper == null) {
            helper = new Helper(getContext());
        }
        return helper.getWritableDatabase();
    }

    @PluginMethod
    public void open(PluginCall call) {
        SQLiteDatabase database = db();
        JSObject result = new JSObject();
        result.put("path", database.getPath());
        // Reported so the app can tell the learner where their practice lives
        // on the Privacy & Data screen, rather than asking them to take it on
        // trust.
        result.put("bytes", new File(database.getPath()).length());
        call.resolve(result);
    }

    @PluginMethod
    public void get(PluginCall call) {
        String store = call.getString("store");
        String key = call.getString("key");
        if (store == null || key == null) {
            call.reject("store and key are required");
            return;
        }
        try (
            Cursor cursor = db().query(
                TABLE,
                new String[] { "value" },
                "store = ? AND key = ?",
                new String[] { store, key },
                null,
                null,
                null
            )
        ) {
            JSObject result = new JSObject();
            if (cursor.moveToFirst()) {
                result.put("value", cursor.getString(0));
            }
            call.resolve(result);
        }
    }

    @PluginMethod
    public void getAll(PluginCall call) {
        String store = call.getString("store");
        if (store == null) {
            call.reject("store is required");
            return;
        }
        JSArray values = new JSArray();
        try (
            Cursor cursor = db().query(
                TABLE,
                new String[] { "value" },
                "store = ?",
                new String[] { store },
                null,
                null,
                "key ASC"
            )
        ) {
            while (cursor.moveToNext()) {
                values.put(cursor.getString(0));
            }
        }
        JSObject result = new JSObject();
        result.put("values", values);
        call.resolve(result);
    }

    @PluginMethod
    public void put(PluginCall call) {
        String store = call.getString("store");
        String key = call.getString("key");
        String value = call.getString("value");
        if (store == null || key == null || value == null) {
            call.reject("store, key and value are required");
            return;
        }
        db().insertWithOnConflict(TABLE, null, row(store, key, value), SQLiteDatabase.CONFLICT_REPLACE);
        call.resolve();
    }

    @PluginMethod
    public void putMany(PluginCall call) {
        String store = call.getString("store");
        JSArray entries = call.getArray("entries");
        if (store == null || entries == null) {
            call.reject("store and entries are required");
            return;
        }
        SQLiteDatabase database = db();
        // One transaction, not one per entry. A finished lesson writes an
        // attempt, a progress record and a day's roll-up together; committing
        // them separately means a process death between two of them leaves the
        // learner's record disagreeing with itself.
        database.beginTransaction();
        try {
            for (int index = 0; index < entries.length(); index += 1) {
                JSONObject entry = entries.getJSONObject(index);
                database.insertWithOnConflict(
                    TABLE,
                    null,
                    row(store, entry.getString("key"), entry.getString("value")),
                    SQLiteDatabase.CONFLICT_REPLACE
                );
            }
            database.setTransactionSuccessful();
        } catch (JSONException error) {
            call.reject("entries must be [{ key, value }]", error);
            return;
        } finally {
            database.endTransaction();
        }
        call.resolve();
    }

    @PluginMethod
    public void remove(PluginCall call) {
        String store = call.getString("store");
        String key = call.getString("key");
        if (store == null || key == null) {
            call.reject("store and key are required");
            return;
        }
        db().delete(TABLE, "store = ? AND key = ?", new String[] { store, key });
        call.resolve();
    }

    @PluginMethod
    public void clearStore(PluginCall call) {
        String store = call.getString("store");
        if (store == null) {
            call.reject("store is required");
            return;
        }
        db().delete(TABLE, "store = ?", new String[] { store });
        call.resolve();
    }

    @PluginMethod
    public void clearAll(PluginCall call) {
        // DELETE rather than DROP, so the table's shape is not something that
        // exists only when a learner has data.
        db().delete(TABLE, null, null);
        call.resolve();
    }

    private static ContentValues row(String store, String key, String value) {
        ContentValues values = new ContentValues(3);
        values.put("store", store);
        values.put("key", key);
        values.put("value", value);
        return values;
    }

    @Override
    protected void handleOnDestroy() {
        if (helper != null) {
            helper.close();
            helper = null;
        }
        super.handleOnDestroy();
    }
}
