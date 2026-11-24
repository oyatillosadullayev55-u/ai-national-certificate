import 'package:flutter/material.dart';
import 'package:flutter_math_fork/flutter_math.dart';

/// Matnni oddiy va LaTeX ($...$) bo'laklariga ajratadi.
List<({String text, bool isMath})> splitMath(String input) {
  final out = <({String text, bool isMath})>[];
  final re = RegExp(r'\$([^$]+)\$');
  var last = 0;
  for (final m in re.allMatches(input)) {
    if (m.start > last) out.add((text: input.substring(last, m.start), isMath: false));
    out.add((text: m.group(1)!, isMath: true));
    last = m.end;
  }
  if (last < input.length) out.add((text: input.substring(last), isMath: false));
  return out;
}

/// Savol matni: oddiy matn + inline formulalar
class MathText extends StatelessWidget {
  const MathText(this.text, {super.key, this.style});

  final String text;
  final TextStyle? style;

  @override
  Widget build(BuildContext context) {
    final base = style ?? Theme.of(context).textTheme.bodyLarge!;
    final parts = splitMath(text);
    if (parts.every((p) => !p.isMath)) return Text(text, style: base);
    return Text.rich(
      TextSpan(
        style: base,
        children: [
          for (final p in parts)
            if (p.isMath)
              WidgetSpan(
                alignment: PlaceholderAlignment.middle,
                child: Math.tex(
                  p.text,
                  mathStyle: MathStyle.text,
                  textStyle: base,
                  onErrorFallback: (_) => Text(p.text, style: base.copyWith(fontFamily: 'monospace')),
                ),
              )
            else
              TextSpan(text: p.text),
        ],
      ),
    );
  }
}
