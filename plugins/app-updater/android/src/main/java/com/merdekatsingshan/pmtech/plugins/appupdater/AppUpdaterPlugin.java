package com.merdekatsingshan.pmtech.plugins.appupdater;

import android.app.Activity;
import android.content.pm.ApplicationInfo;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.Log;

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
  private static final String TAG = "AppUpdater";

  private Handler mainHandler() {
    return new Handler(Looper.getMainLooper());
  }

  private static String safeUrlForLogs(String rawUrl) {
    try {
      Uri uri = Uri.parse(rawUrl);
      String scheme = uri.getScheme();
      String host = uri.getHost();
      String path = uri.getEncodedPath();
      String safeScheme = scheme == null ? "?" : scheme;
      String safeHost = host == null ? "?" : host;
      String safePath = path == null ? "" : path;
      return safeScheme + "://" + safeHost + safePath;
    } catch (Exception ignored) {
      return "<invalid-url>";
    }
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
      Log.w(TAG, "downloadAndInstall: missing url");
      call.reject("Missing url");
      return;
    }

    final String urlString = urlRaw.trim();
    String lowerUrlString = urlString.toLowerCase(Locale.US);
    boolean isHttps = lowerUrlString.startsWith("https://");
    boolean isHttp = lowerUrlString.startsWith("http://");
    boolean isDebuggable = false;
    try {
      ApplicationInfo appInfo = getContext().getApplicationInfo();
      isDebuggable = (appInfo.flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
    } catch (Exception ignored) {
    }

    if (!isHttps && !(isDebuggable && isHttp)) {
      Log.w(TAG, "downloadAndInstall: rejected non-https url=" + safeUrlForLogs(urlString) + " debuggable=" + isDebuggable);
      call.reject("Only https URLs are allowed");
      return;
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      boolean canInstall = getContext().getPackageManager().canRequestPackageInstalls();
      if (!canInstall) {
        Log.w(TAG, "downloadAndInstall: needs unknown sources permission");
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

    Log.d(TAG, "downloadAndInstall: start url=" + safeUrlForLogs(urlString) + " fileName=" + fileName);
    Log.d(TAG, "downloadAndInstall: cacheFile=" + outFile.getAbsolutePath());

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
                Log.w(TAG, "downloadAndInstall: redirect missing Location header status=" + status);
                status = 0;
                break;
              }
              url = new URL(url, location);
              Log.d(TAG, "downloadAndInstall: redirect status=" + status + " -> " + safeUrlForLogs(url.toString()));
              continue;
            }
            break;
          }

          Log.d(TAG, "downloadAndInstall: response status=" + status);
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

          int contentLength = connection.getContentLength();
          if (contentLength >= 0) {
            Log.d(TAG, "downloadAndInstall: contentLength=" + contentLength);
          }

          input = connection.getInputStream();
          output = new FileOutputStream(outFile);
          byte[] buffer = new byte[8192];
          int read;
          long totalBytes = 0L;
          while ((read = input.read(buffer)) != -1) {
            output.write(buffer, 0, read);
            totalBytes += read;
          }
          output.flush();
          Log.d(TAG, "downloadAndInstall: download complete bytes=" + totalBytes);

          handler.post(
            () -> {
              try {
                Log.d(TAG, "downloadAndInstall: launching installer");
                installApk(outFile);
                JSObject out = new JSObject();
                out.put("ok", true);
                call.resolve(out);
                call.release(getBridge());
              } catch (Exception e) {
                Log.e(TAG, "downloadAndInstall: install failed", e);
                call.reject("Install failed");
                call.release(getBridge());
              }
            }
          );
        } catch (Exception e) {
          Log.e(TAG, "downloadAndInstall: download failed", e);
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
