import 'package:flutter/material.dart';

/// Brand colors matching admin web (styles.css)
/// --blue: #004aad
const brandBlue = Color(0xFF004AAD);
const brandBlueHover = Color(0xFF003B8A);
const brandBlueLight = Color(0xFF79B7FF);
const brandBlueSoft = Color(0xFFE5F0FF);
const brandBluePastel = Color(0xFFCFE3FF);

/// Light theme color scheme (matches admin :root light)
const lightColorScheme = ColorScheme(
  brightness: Brightness.light,
  primary: brandBlue,
  onPrimary: Colors.white,
  primaryContainer: brandBlueSoft,
  onPrimaryContainer: brandBlue,
  secondary: brandBlueLight,
  onSecondary: brandBlue,
  secondaryContainer: brandBluePastel,
  onSecondaryContainer: brandBlue,
  tertiary: Color(0xFF276844), // success
  onTertiary: Colors.white,
  tertiaryContainer: Color(0xFFEDF7F1),
  onTertiaryContainer: Color(0xFF276844),
  error: Color(0xFFA23729),
  onError: Colors.white,
  errorContainer: Color(0xFFFFF1EF),
  onErrorContainer: Color(0xFFA23729),
  surface: Colors.white,
  onSurface: Color(0xFF101828),
  surfaceContainerHighest: Color(0xFFF1F6FF),
  onSurfaceVariant: Color(0xFF344763),
  outline: Color(0xFFD6E3F3),
  outlineVariant: Color(0xFFB8CDE8),
  shadow: Color(0x14004AAD), // rgba(0, 74, 173, 0.08)
  scrim: Colors.black54,
  inverseSurface: Color(0xFF0D121A),
  onInverseSurface: Color(0xFFF7FAFF),
  inversePrimary: brandBlueLight,
);

/// Dark theme color scheme (matches admin :root[data-theme="dark"])
const darkColorScheme = ColorScheme(
  brightness: Brightness.dark,
  primary: brandBlue,
  onPrimary: Colors.white,
  primaryContainer: Color(0xFF10294A),
  onPrimaryContainer: brandBlueLight,
  secondary: brandBlueLight,
  onSecondary: brandBlue,
  secondaryContainer: Color(0xFF193B68),
  onSecondaryContainer: brandBlueLight,
  tertiary: Color(0xFFADDDBD), // success
  onTertiary: Color(0xFF152A22),
  tertiaryContainer: Color(0xFF152A22),
  onTertiaryContainer: Color(0xFFADDDBD),
  error: Color(0xFFFFB9AF),
  onError: Color(0xFF311C1C),
  errorContainer: Color(0xFF311C1C),
  onErrorContainer: Color(0xFFFFB9AF),
  surface: Color(0xFF0D121A),
  onSurface: Color(0xFFF7FAFF),
  surfaceContainerHighest: Color(0xFF121B28),
  onSurfaceVariant: Color(0xFFD1DBEA),
  outline: Color(0xFF22334B),
  outlineVariant: Color(0xFF345177),
  shadow: Color(0x4C002A60), // rgba(0, 42, 96, 0.3)
  scrim: Colors.black87,
  inverseSurface: Colors.white,
  onInverseSurface: Color(0xFF101828),
  inversePrimary: brandBlue,
);

/// Text theme matching admin fonts:
/// - DM Sans for UI (400, 500, 600, 700)
/// - Manrope for headings/brand (400-800)
TextTheme _textTheme(TextTheme base) => base.copyWith(
      displayLarge: base.displayLarge?.copyWith(
        fontFamily: 'Manrope',
        fontWeight: FontWeight.w800,
        letterSpacing: -1,
      ),
      displayMedium: base.displayMedium?.copyWith(
        fontFamily: 'Manrope',
        fontWeight: FontWeight.w800,
        letterSpacing: -0.8,
      ),
      displaySmall: base.displaySmall?.copyWith(
        fontFamily: 'Manrope',
        fontWeight: FontWeight.w700,
      ),
      headlineLarge: base.headlineLarge?.copyWith(
        fontFamily: 'Manrope',
        fontWeight: FontWeight.w800,
        letterSpacing: -0.6,
      ),
      headlineMedium: base.headlineMedium?.copyWith(
        fontFamily: 'Manrope',
        fontWeight: FontWeight.w700,
      ),
      headlineSmall: base.headlineSmall?.copyWith(
        fontFamily: 'Manrope',
        fontWeight: FontWeight.w600,
      ),
      titleLarge: base.titleLarge?.copyWith(
        fontFamily: 'DM Sans',
        fontWeight: FontWeight.w600,
      ),
      titleMedium: base.titleMedium?.copyWith(
        fontFamily: 'DM Sans',
        fontWeight: FontWeight.w500,
      ),
      titleSmall: base.titleSmall?.copyWith(
        fontFamily: 'DM Sans',
        fontWeight: FontWeight.w500,
      ),
      bodyLarge: base.bodyLarge?.copyWith(
        fontFamily: 'DM Sans',
        fontWeight: FontWeight.w400,
      ),
      bodyMedium: base.bodyMedium?.copyWith(
        fontFamily: 'DM Sans',
        fontWeight: FontWeight.w400,
      ),
      bodySmall: base.bodySmall?.copyWith(
        fontFamily: 'DM Sans',
        fontWeight: FontWeight.w400,
      ),
      labelLarge: base.labelLarge?.copyWith(
        fontFamily: 'DM Sans',
        fontWeight: FontWeight.w600,
      ),
      labelMedium: base.labelMedium?.copyWith(
        fontFamily: 'DM Sans',
        fontWeight: FontWeight.w500,
      ),
      labelSmall: base.labelSmall?.copyWith(
        fontFamily: 'DM Sans',
        fontWeight: FontWeight.w500,
      ),
    );

/// Input decoration theme matching admin styles
InputDecorationTheme _inputDecorationTheme(ColorScheme scheme) => InputDecorationTheme(
      filled: true,
      fillColor: scheme.surface,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide(color: scheme.outline),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide(color: scheme.outline),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide(color: scheme.primary, width: 2),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide(color: scheme.error),
      ),
      focusedErrorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide(color: scheme.error, width: 2),
      ),
      disabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide(color: scheme.outlineVariant),
      ),
      labelStyle: TextStyle(
        color: scheme.onSurfaceVariant,
        fontFamily: 'DM Sans',
        fontWeight: FontWeight.w400,
      ),
      floatingLabelStyle: TextStyle(
        color: scheme.primary,
        fontFamily: 'DM Sans',
        fontWeight: FontWeight.w500,
      ),
      hintStyle: TextStyle(
        color: scheme.onSurfaceVariant.withValues(alpha: 0.6),
        fontFamily: 'DM Sans',
        fontWeight: FontWeight.w400,
      ),
      errorStyle: TextStyle(
        color: scheme.error,
        fontFamily: 'DM Sans',
        fontSize: 12,
      ),
    );

/// Filled button theme matching admin .primary
FilledButtonThemeData _filledButtonTheme(ColorScheme scheme) => FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: scheme.primary,
        foregroundColor: scheme.onPrimary,
        minimumSize: const Size(double.infinity, 48),
        padding: const EdgeInsets.symmetric(vertical: 14),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(10),
        ),
        textStyle: const TextStyle(
          fontFamily: 'DM Sans',
          fontWeight: FontWeight.w600,
          fontSize: 16,
        ),
        elevation: 0,
        shadowColor: scheme.shadow,
      ),
    );

/// Outlined button theme
OutlinedButtonThemeData _outlinedButtonTheme(ColorScheme scheme) => OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: scheme.primary,
        minimumSize: const Size(double.infinity, 48),
        padding: const EdgeInsets.symmetric(vertical: 14),
        side: BorderSide(color: scheme.primary, width: 1.5),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(10),
        ),
        textStyle: const TextStyle(
          fontFamily: 'DM Sans',
          fontWeight: FontWeight.w600,
          fontSize: 16,
        ),
      ),
    );

/// Card theme matching admin card styles
CardThemeData _cardTheme(ColorScheme scheme) => CardThemeData(
      color: scheme.surface,
      elevation: 0,
      margin: const EdgeInsets.only(bottom: 12),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: scheme.outline),
      ),
      shadowColor: scheme.shadow,
    );

/// AppBar theme
AppBarTheme _appBarTheme(ColorScheme scheme) => AppBarTheme(
      backgroundColor: scheme.surface,
      foregroundColor: scheme.onSurface,
      elevation: 0,
      centerTitle: false,
      surfaceTintColor: Colors.transparent,
      titleTextStyle: TextStyle(
        fontFamily: 'Manrope',
        fontWeight: FontWeight.w700,
        fontSize: 20,
        color: scheme.onSurface,
      ),
      iconTheme: IconThemeData(color: scheme.onSurface),
      actionsIconTheme: IconThemeData(color: scheme.onSurface),
    );

/// Complete light theme
ThemeData lightTheme = ThemeData(
  useMaterial3: true,
  colorScheme: lightColorScheme,
  scaffoldBackgroundColor: lightColorScheme.surface,
  fontFamily: 'DM Sans',
  textTheme: _textTheme(ThemeData.light().textTheme.apply(
        fontFamily: 'DM Sans',
        displayColor: lightColorScheme.onSurface,
        bodyColor: lightColorScheme.onSurface,
      )),
  inputDecorationTheme: _inputDecorationTheme(lightColorScheme),
  filledButtonTheme: _filledButtonTheme(lightColorScheme),
  outlinedButtonTheme: _outlinedButtonTheme(lightColorScheme),
  cardTheme: _cardTheme(lightColorScheme),
  appBarTheme: _appBarTheme(lightColorScheme),
  iconTheme: IconThemeData(color: lightColorScheme.onSurface),
  dividerColor: lightColorScheme.outline,
  dividerTheme: DividerThemeData(
    color: lightColorScheme.outline,
    thickness: 1,
    space: 1,
  ),
  snackBarTheme: SnackBarThemeData(
    backgroundColor: lightColorScheme.inverseSurface,
    contentTextStyle: TextStyle(
      fontFamily: 'DM Sans',
      color: lightColorScheme.onInverseSurface,
    ),
    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    behavior: SnackBarBehavior.floating,
  ),
  bottomSheetTheme: BottomSheetThemeData(
    backgroundColor: lightColorScheme.surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    surfaceTintColor: Colors.transparent,
  ),
  dialogTheme: DialogThemeData(
    backgroundColor: lightColorScheme.surface,
    surfaceTintColor: Colors.transparent,
    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
    titleTextStyle: TextStyle(
      fontFamily: 'Manrope',
      fontWeight: FontWeight.w700,
      fontSize: 20,
      color: lightColorScheme.onSurface,
    ),
    contentTextStyle: TextStyle(
      fontFamily: 'DM Sans',
      fontSize: 16,
      color: lightColorScheme.onSurface,
    ),
  ),
);

/// Complete dark theme
ThemeData darkTheme = ThemeData(
  useMaterial3: true,
  colorScheme: darkColorScheme,
  scaffoldBackgroundColor: darkColorScheme.surface,
  fontFamily: 'DM Sans',
  textTheme: _textTheme(ThemeData.dark().textTheme.apply(
        fontFamily: 'DM Sans',
        displayColor: darkColorScheme.onSurface,
        bodyColor: darkColorScheme.onSurface,
      )),
  inputDecorationTheme: _inputDecorationTheme(darkColorScheme),
  filledButtonTheme: _filledButtonTheme(darkColorScheme),
  outlinedButtonTheme: _outlinedButtonTheme(darkColorScheme),
  cardTheme: _cardTheme(darkColorScheme),
  appBarTheme: _appBarTheme(darkColorScheme),
  iconTheme: IconThemeData(color: darkColorScheme.onSurface),
  dividerColor: darkColorScheme.outline,
  dividerTheme: DividerThemeData(
    color: darkColorScheme.outline,
    thickness: 1,
    space: 1,
  ),
  snackBarTheme: SnackBarThemeData(
    backgroundColor: darkColorScheme.inverseSurface,
    contentTextStyle: TextStyle(
      fontFamily: 'DM Sans',
      color: darkColorScheme.onInverseSurface,
    ),
    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    behavior: SnackBarBehavior.floating,
  ),
  bottomSheetTheme: BottomSheetThemeData(
    backgroundColor: darkColorScheme.surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    surfaceTintColor: Colors.transparent,
  ),
  dialogTheme: DialogThemeData(
    backgroundColor: darkColorScheme.surface,
    surfaceTintColor: Colors.transparent,
    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
    titleTextStyle: TextStyle(
      fontFamily: 'Manrope',
      fontWeight: FontWeight.w700,
      fontSize: 20,
      color: darkColorScheme.onSurface,
    ),
    contentTextStyle: TextStyle(
      fontFamily: 'DM Sans',
      fontSize: 16,
      color: darkColorScheme.onSurface,
    ),
  ),
);

/// Extension for easy access to brand colors in widgets
extension BrandColors on BuildContext {
  Color get brandBlue => const Color(0xFF004AAD);
  Color get brandBlueHover => const Color(0xFF003B8A);
  Color get brandBlueLight => const Color(0xFF79B7FF);
  Color get brandBlueSoft => const Color(0xFFE5F0FF);
  Color get brandBluePastel => const Color(0xFFCFE3FF);
}