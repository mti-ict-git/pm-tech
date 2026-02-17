package com.merdekatsingshan.pmtech;

import com.getcapacitor.BridgeActivity;

import android.os.Bundle;
import android.util.Log;

public class MainActivity extends BridgeActivity {
  private static final String TAG = "MainActivity";

  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    Log.d(TAG, "onCreate: started");
  }
}
