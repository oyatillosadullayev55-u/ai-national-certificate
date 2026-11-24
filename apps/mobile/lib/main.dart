import 'package:flutter/material.dart';

import 'core/session.dart';
import 'core/theme.dart';
import 'screens/auth/login_screen.dart';
import 'screens/home_shell.dart';
import 'screens/onboarding_screen.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  session.bootstrap();
  runApp(const AncApp());
}

class AncApp extends StatelessWidget {
  const AncApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'AI National Certificate',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      home: ListenableBuilder(
        listenable: session,
        builder: (context, _) => switch (session.status) {
          SessionStatus.loading => const Scaffold(body: Center(child: CircularProgressIndicator())),
          SessionStatus.loggedOut => const LoginScreen(),
          SessionStatus.onboarding => const OnboardingScreen(),
          SessionStatus.ready => const HomeShell(),
        },
      ),
    );
  }
}
