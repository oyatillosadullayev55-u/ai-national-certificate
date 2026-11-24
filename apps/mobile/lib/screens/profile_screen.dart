import 'package:flutter/material.dart';

import '../core/session.dart';
import 'error_notebook_screen.dart';

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final me = session.me ?? const {};
    final profile = (me['profile'] as Map?) ?? const {};
    return Scaffold(
      appBar: AppBar(title: const Text('Profil')),
      body: ListView(children: [
        const SizedBox(height: 16),
        CircleAvatar(radius: 36, child: Text(session.firstName.isEmpty ? '?' : session.firstName[0], style: const TextStyle(fontSize: 28))),
        const SizedBox(height: 8),
        Center(child: Text('${profile['firstName'] ?? ''} ${profile['lastName'] ?? ''}', style: Theme.of(context).textTheme.titleLarge)),
        Center(child: Text(me['phone'] as String? ?? '')),
        const SizedBox(height: 16),
        ListTile(
          leading: const Icon(Icons.menu_book_outlined),
          title: const Text('Xatolar daftari'),
          onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const ErrorNotebookScreen())),
        ),
        ListTile(leading: const Icon(Icons.tune), title: const Text('Fanlar va maqsadlar'), onTap: session.editSubjects),
        const Divider(),
        ListTile(leading: const Icon(Icons.logout), title: const Text('Chiqish'), onTap: () => session.logout()),
        ListTile(
          leading: const Icon(Icons.devices),
          title: const Text('Barcha qurilmalardan chiqish'),
          onTap: () async {
            final ok = await showDialog<bool>(
              context: context,
              builder: (c) => AlertDialog(
                title: const Text('Barcha qurilmalardan chiqasizmi?'),
                actions: [
                  TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Yo\'q')),
                  FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Ha')),
                ],
              ),
            );
            if (ok == true) await session.logout(all: true);
          },
        ),
        const SizedBox(height: 24),
        const Center(child: Text('Platformadagi natijalar rasmiy milliy sertifikat bali emas.', style: TextStyle(fontSize: 12))),
      ]),
    );
  }
}
