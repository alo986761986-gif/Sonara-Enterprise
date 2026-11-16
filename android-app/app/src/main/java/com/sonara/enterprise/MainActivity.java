package com.sonara.enterprise;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.browser.customtabs.CustomTabColorSchemeParams;
import androidx.browser.customtabs.CustomTabsIntent;

/**
 * First-party SONARA Android entry point.
 *
 * The actual music product remains at the existing HTTPS origin. A verified
 * Android browser handles Google/Apple login, cookies, media permissions,
 * file uploads and downloads without copying credentials into a WebView.
 */
public final class MainActivity extends Activity {
    private static final Uri SONARA_URL = Uri.parse("https://sonaraenterprise.com/");
    private static final int BACKGROUND = Color.rgb(10, 16, 31);
    private static final int ACCENT = Color.rgb(63, 222, 190);

    private boolean opening = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(BACKGROUND);
        getWindow().setNavigationBarColor(BACKGROUND);
        buildHomeScreen();
        if (savedInstanceState == null) {
            new Handler(Looper.getMainLooper()).postDelayed(this::openSonara, 500);
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
    }

    private void buildHomeScreen() {
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setGravity(Gravity.CENTER);
        content.setPadding(dp(24), dp(28), dp(24), dp(28));
        content.setBackgroundColor(BACKGROUND);

        ImageView logo = new ImageView(this);
        logo.setImageResource(R.drawable.ic_sonara);
        logo.setContentDescription("SONARA");
        LinearLayout.LayoutParams logoParams = new LinearLayout.LayoutParams(dp(116), dp(116));
        logoParams.gravity = Gravity.CENTER_HORIZONTAL;
        content.addView(logo, logoParams);

        TextView title = new TextView(this);
        title.setText("SONARA");
        title.setTextSize(34);
        title.setTextColor(Color.WHITE);
        title.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        title.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        titleParams.topMargin = dp(20);
        content.addView(title, titleParams);

        TextView subtitle = new TextView(this);
        subtitle.setText("CREA MUSICA CON L'INTELLIGENZA ARTIFICIALE");
        subtitle.setTextSize(12);
        subtitle.setLetterSpacing(0.12f);
        subtitle.setTextColor(Color.rgb(166, 185, 207));
        subtitle.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams subtitleParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        subtitleParams.topMargin = dp(12);
        content.addView(subtitle, subtitleParams);

        Button open = new Button(this);
        open.setAllCaps(false);
        open.setText("Apri SONARA");
        open.setTextSize(16);
        open.setTextColor(BACKGROUND);
        open.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        open.setPadding(dp(16), dp(12), dp(16), dp(12));
        GradientDrawable buttonBackground = new GradientDrawable(
                GradientDrawable.Orientation.LEFT_RIGHT,
                new int[] { ACCENT, Color.rgb(114, 212, 255) });
        buttonBackground.setCornerRadius(dp(17));
        open.setBackground(buttonBackground);
        open.setOnClickListener(view -> openSonara());
        LinearLayout.LayoutParams buttonParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(56));
        buttonParams.topMargin = dp(42);
        content.addView(open, buttonParams);

        TextView hint = new TextView(this);
        hint.setText("Account, musica e archivio sul sito ufficiale.\nServe una connessione Internet.");
        hint.setTextColor(Color.rgb(131, 153, 180));
        hint.setTextSize(12);
        hint.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams hintParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        hintParams.topMargin = dp(23);
        content.addView(hint, hintParams);

        setContentView(content);
    }

    private void openSonara() {
        if (opening || isFinishing()) {
            return;
        }
        opening = true;
        try {
            CustomTabColorSchemeParams colors = new CustomTabColorSchemeParams.Builder()
                    .setToolbarColor(BACKGROUND)
                    .setNavigationBarColor(BACKGROUND)
                    .build();
            CustomTabsIntent tabs = new CustomTabsIntent.Builder()
                    .setDefaultColorSchemeParams(colors)
                    .setColorScheme(CustomTabsIntent.COLOR_SCHEME_DARK)
                    .setUrlBarHidingEnabled(true)
                    .setShowTitle(false)
                    .setShareState(CustomTabsIntent.SHARE_STATE_OFF)
                    .build();
            tabs.launchUrl(this, SONARA_URL);
        } catch (ActivityNotFoundException unsupported) {
            openInBrowserFallback();
        } catch (Exception unexpected) {
            openInBrowserFallback();
        } finally {
            new Handler(Looper.getMainLooper()).postDelayed(() -> opening = false, 650);
        }
    }

    private void openInBrowserFallback() {
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, SONARA_URL);
            intent.addCategory(Intent.CATEGORY_BROWSABLE);
            startActivity(intent);
        } catch (ActivityNotFoundException noBrowser) {
            Toast.makeText(this, "Installa Chrome o un browser Android per aprire SONARA.", Toast.LENGTH_LONG).show();
        }
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
