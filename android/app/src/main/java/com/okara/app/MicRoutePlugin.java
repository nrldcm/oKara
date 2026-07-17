package com.okara.app;

import android.content.Context;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Routes the microphone to a paired Bluetooth headset / karaoke mic so the
 * WebView's getUserMedia captures from it instead of the built-in mic.
 * Uses setCommunicationDevice on Android 12+ and legacy Bluetooth SCO below.
 * Note: Bluetooth mics use the SCO voice link, so capture quality is
 * phone-call grade — fine for karaoke scoring and vocal FX.
 */
@CapacitorPlugin(name = "MicRoute")
public class MicRoutePlugin extends Plugin {

    private AudioManager am() {
        return (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
    }

    private AudioDeviceInfo btScoInput() {
        for (AudioDeviceInfo d : am().getDevices(AudioManager.GET_DEVICES_INPUTS)) {
            if (d.getType() == AudioDeviceInfo.TYPE_BLUETOOTH_SCO) return d;
        }
        return null;
    }

    private boolean isOn() {
        AudioManager am = am();
        if (Build.VERSION.SDK_INT >= 31) {
            AudioDeviceInfo dev = am.getCommunicationDevice();
            return dev != null && dev.getType() == AudioDeviceInfo.TYPE_BLUETOOTH_SCO;
        }
        return am.isBluetoothScoOn();
    }

    private JSObject snapshot() {
        JSObject ret = new JSObject();
        ret.put("available", btScoInput() != null);
        ret.put("on", isOn());
        return ret;
    }

    @PluginMethod
    public void status(PluginCall call) {
        call.resolve(snapshot());
    }

    @PluginMethod
    public void setBluetooth(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        AudioManager am = am();
        try {
            if (on) {
                if (btScoInput() == null) {
                    call.reject("No Bluetooth mic connected");
                    return;
                }
                am.setMode(AudioManager.MODE_IN_COMMUNICATION);
                if (Build.VERSION.SDK_INT >= 31) {
                    am.setCommunicationDevice(btScoInput());
                } else {
                    am.startBluetoothSco();
                    am.setBluetoothScoOn(true);
                }
            } else {
                if (Build.VERSION.SDK_INT >= 31) {
                    am.clearCommunicationDevice();
                } else {
                    am.stopBluetoothSco();
                    am.setBluetoothScoOn(false);
                }
                am.setMode(AudioManager.MODE_NORMAL);
            }
            call.resolve(snapshot());
        } catch (Exception e) {
            call.reject("Bluetooth mic routing failed", e);
        }
    }
}
