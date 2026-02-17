package com.merdekatsingshan.pmtech;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Locale;

@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {
  private Handler mainHandler() {
    return new Handler(Looper.getMainLooper());
  }

  private static String sanitizeFileName(String fileName) {
    String trimmed = fileName == null ? "" : fileName.trim();
    if (trimmed.isEmpty()) return "update.apk";
    String base = new File(trimmed).getName();
    String normalized = base.replaceAll("[^a-zA-Z0-9._-]", "_");
    if (normalized.isEmpty()) return "update.apk";
    String lower = normalized.toLowerCase(Locale.US);
    if (!lower.endsWith(".apk")) return normalized + ".apk";
    return normalized;
  }

  private void openUnknownSourcesSettings() {
    try {
      Uri uri = Uri.parse("package:" + getContext().getPackageName());
      Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, uri);
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      Activity activity = getActivity();
      if (activity != null) activity.startActivity(intent);
    } catch (Exception ignored) {
    }
  }

  private void installApk(File file) {
    Uri apkUri = FileProvider.getUriForFile(
      getContext(),
      getContext().getPackageName() + ".fileprovider",
      file
    );
    Intent intent = new Intent(Intent.ACTION_VIEW);
    intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
    intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    Activity activity = getActivity();
    if (activity != null) activity.startActivity(intent);
  }

  @PluginMethod
  public void downloadAndInstall(final PluginCall call) {
    final String urlRaw = call.getString("url");
    final String fileNameRaw = call.getString("fileName");
    final String fileName = sanitizeFileName(fileNameRaw);

    if (urlRaw == null || urlRaw.trim().isEmpty()) {
      call.reject("Missing url");
      return;
    }

    final String urlString = urlRaw.trim();
    if (!urlString.toLowerCase(Locale.US).startsWith("https://")) {
      call.reject("Only https URLs are allowed");
      return;
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      boolean canInstall = getContext().getPackageManager().canRequestPackageInstalls();
      if (!canInstall) {
        openUnknownSourcesSettings();
        JSObject out = new JSObject();
        out.put("ok", false);
        out.put("code", "NEEDS_UNKNOWN_SOURCES_PERMISSION");
        call.resolve(out);
        return;
      }
    }

    call.setKeepAlive(true);

    final File outFile = new File(getContext().getCacheDir(), fileName);
    final Handler handler = mainHandler();

    new Thread(
      () -> {
        HttpURLConnection connection = null;
        InputStream input = null;
        FileOutputStream output = null;
        try {
          URL url = new URL(urlString);
          int status = -1;
          for (int i = 0; i < 6; i++) {
            if (connection != null) connection.disconnect();
            connection = (HttpURLConnection) url.openConnection();
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(120000);
            connection.setRequestMethod("GET");
            connection.setRequestProperty("Accept", "*/*");
            connection.connect();

            status = connection.getResponseCode();
            if (status == 301 || status == 302 || status == 303 || status == 307 || status == 308) {
              String location = connection.getHeaderField("Location");
              if (location == null || location.trim().isEmpty()) {
                status = 0;
                break;
              }
              url = new URL(url, location);
              continue;
            }
            break;
          }

          if (status < 200 || status >= 300) {
            int finalStatus = status;
            handler.post(
              () -> {
                call.reject("Download failed: HTTP " + finalStatus);
                call.release(getBridge());
              }
            );
            return;
          }

          input = connection.getInputStream();
          output = new FileOutputStream(outFile);
          byte[] buffer = new byte[8192];
          int read;
          while ((read = input.read(buffer)) != -1) {
            output.write(buffer, 0, read);
          }
          output.flush();

          handler.post(
            () -> {
              try {
                installApk(outFile);
                JSObject out = new JSObject();
                out.put("ok", true);
                call.resolve(out);
                call.release(getBridge());
              } catch (Exception e) {
                call.reject("Install failed");
                call.release(getBridge());
              }
            }
          );
        } catch (Exception e) {
          handler.post(
            () -> {
              String message = e.getMessage();
              String safeMessage = message == null || message.trim().isEmpty() ? e.getClass().getSimpleName() : message;
              call.reject("Download failed: " + safeMessage);
              call.release(getBridge());
            }
          );
        } finally {
          try {
            if (input != null) input.close();
          } catch (Exception ignored) {
          }
          try {
            if (output != null) output.close();
          } catch (Exception ignored) {
          }
          if (connection != null) connection.disconnect();
        }
      }
    ).start();
  }
}
