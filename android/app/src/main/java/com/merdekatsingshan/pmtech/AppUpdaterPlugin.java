package com.merdekatsingshan.pmtech;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
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
      getActivity().startActivity(intent);
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
    getActivity().startActivity(intent);
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

    final File outFile = new File(getContext().getCacheDir(), fileName);

    new Thread(
      () -> {
        HttpURLConnection connection = null;
        InputStream input = null;
        FileOutputStream output = null;
        try {
          URL url = new URL(urlString);
          connection = (HttpURLConnection) url.openConnection();
          connection.setInstanceFollowRedirects(true);
          connection.setConnectTimeout(15000);
          connection.setReadTimeout(30000);
          connection.setRequestMethod("GET");
          connection.connect();

          int status = connection.getResponseCode();
          if (status < 200 || status >= 300) {
            call.reject("Download failed: HTTP " + status);
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

          getActivity().runOnUiThread(
            () -> {
              try {
                installApk(outFile);
                JSObject out = new JSObject();
                out.put("ok", true);
                call.resolve(out);
              } catch (Exception e) {
                call.reject("Install failed");
              }
            }
          );
        } catch (Exception e) {
          call.reject("Download failed");
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

