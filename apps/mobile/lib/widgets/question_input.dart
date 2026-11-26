import 'package:flutter/material.dart';

import 'math_text.dart';

const singleOptionTypes = {'SINGLE_CHOICE', 'IMAGE_BASED', 'DIAGRAM_BASED', 'CONTEXT_BASED'};

/// Savol turiga qarab javob kiritish vidjeti. Javob formati serverdagi evaluateAnswer bilan bir xil:
/// {optionId} | {optionIds} | {value} | {text} | {pairs} | {order}
class QuestionInput extends StatelessWidget {
  const QuestionInput({super.key, required this.question, required this.response, required this.onChanged, this.enabled = true});

  final Map<String, dynamic> question;
  final Map<String, dynamic>? response;
  final ValueChanged<Map<String, dynamic>> onChanged;
  final bool enabled;

  String get type => question['type'] as String;
  List<Map<String, dynamic>> get options =>
      ((question['options'] as List?) ?? []).map((e) => Map<String, dynamic>.from(e as Map)).toList();
  Map<String, dynamic> get payload => Map<String, dynamic>.from((question['payload'] as Map?) ?? {});

  @override
  Widget build(BuildContext context) {
    if (singleOptionTypes.contains(type) && options.isNotEmpty) {
      final selected = response?['optionId'];
      return Column(children: [
        for (final o in options)
          _OptionTile(
            label: o['label'] as String,
            content: o['content'] as String,
            selected: selected == o['id'],
            multi: false,
            onTap: enabled ? () => onChanged({'optionId': o['id']}) : null,
          ),
      ]);
    }

    switch (type) {
      case 'MULTIPLE_CHOICE':
        final ids = Set<String>.from((response?['optionIds'] as List?) ?? const []);
        return Column(children: [
          for (final o in options)
            _OptionTile(
              label: o['label'] as String,
              content: o['content'] as String,
              selected: ids.contains(o['id']),
              multi: true,
              onTap: enabled
                  ? () {
                      final next = {...ids};
                      final id = o['id'] as String;
                      next.contains(id) ? next.remove(id) : next.add(id);
                      onChanged({'optionIds': next.toList()});
                    }
                  : null,
            ),
          const Padding(padding: EdgeInsets.only(top: 4), child: Text('Bir nechta to\'g\'ri javob bo\'lishi mumkin')),
        ]);

      case 'TRUE_FALSE':
        final v = response?['value'];
        return Row(children: [
          Expanded(child: _OptionTile(label: '✓', content: 'Rost', selected: v == true, multi: false, onTap: enabled ? () => onChanged({'value': true}) : null)),
          const SizedBox(width: 8),
          Expanded(child: _OptionTile(label: '✗', content: 'Yolg\'on', selected: v == false, multi: false, onTap: enabled ? () => onChanged({'value': false}) : null)),
        ]);

      case 'NUMERIC':
        return _TextAnswer(
          key: ValueKey('num-${question['questionVersionId']}'),
          initial: response?['value']?.toString() ?? '',
          hint: 'Javob (masalan 3,5 yoki 3/4)',
          numeric: true,
          enabled: enabled,
          onChanged: (s) => onChanged({'value': s}),
        );

      case 'TEXT':
      case 'FORMULA':
      case 'WRITTEN_RESPONSE':
        return _TextAnswer(
          key: ValueKey('txt-${question['questionVersionId']}'),
          initial: response?['text'] as String? ?? '',
          hint: type == 'WRITTEN_RESPONSE' ? 'Javobingizni yozing' : 'Javob',
          multiline: type == 'WRITTEN_RESPONSE',
          enabled: enabled,
          onChanged: (s) => onChanged({'text': s}),
        );

      case 'MATCHING':
        return _Matching(payload: payload, response: response, onChanged: onChanged, enabled: enabled);

      case 'ORDERING':
        return _Ordering(
          key: ValueKey('ord-${question['questionVersionId']}'),
          payload: payload,
          response: response,
          onChanged: onChanged,
          enabled: enabled,
        );

      default:
        return Text('Bu savol turi ($type) ilovada hali qo\'llab-quvvatlanmaydi');
    }
  }
}

class _OptionTile extends StatelessWidget {
  const _OptionTile({required this.label, required this.content, required this.selected, required this.multi, this.onTap});

  final String label;
  final String content;
  final bool selected;
  final bool multi;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final icon = multi
        ? (selected ? Icons.check_box : Icons.check_box_outline_blank)
        : (selected ? Icons.radio_button_checked : Icons.radio_button_unchecked);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Material(
        color: selected ? cs.primaryContainer : cs.surfaceContainerHighest.withValues(alpha: 0.5),
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: onTap,
          child: Container(
            constraints: const BoxConstraints(minHeight: 52), // barmoq bilan qulay
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            child: Row(children: [
              Icon(icon, color: selected ? cs.primary : cs.outline),
              const SizedBox(width: 10),
              Text('$label)', style: const TextStyle(fontWeight: FontWeight.w700)),
              const SizedBox(width: 8),
              Expanded(child: MathText(content)),
            ]),
          ),
        ),
      ),
    );
  }
}

class _TextAnswer extends StatefulWidget {
  const _TextAnswer({
    super.key,
    required this.initial,
    required this.hint,
    required this.onChanged,
    this.numeric = false,
    this.multiline = false,
    this.enabled = true,
  });

  final String initial;
  final String hint;
  final ValueChanged<String> onChanged;
  final bool numeric;
  final bool multiline;
  final bool enabled;

  @override
  State<_TextAnswer> createState() => _TextAnswerState();
}

class _TextAnswerState extends State<_TextAnswer> {
  late final TextEditingController _c = TextEditingController(text: widget.initial);

  @override
  void didUpdateWidget(_TextAnswer old) {
    super.didUpdateWidget(old);
    // Offline navbatdan tiklangan javob maydonga keyinroq keladi
    if (old.initial != widget.initial && _c.text != widget.initial) _c.text = widget.initial;
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: _c,
      enabled: widget.enabled,
      keyboardType: widget.numeric
          ? const TextInputType.numberWithOptions(decimal: true, signed: true)
          : (widget.multiline ? TextInputType.multiline : TextInputType.text),
      maxLines: widget.multiline ? 8 : 1,
      decoration: InputDecoration(hintText: widget.hint, border: const OutlineInputBorder()),
      onChanged: widget.onChanged,
    );
  }
}

class _Matching extends StatelessWidget {
  const _Matching({required this.payload, required this.response, required this.onChanged, required this.enabled});

  final Map<String, dynamic> payload;
  final Map<String, dynamic>? response;
  final ValueChanged<Map<String, dynamic>> onChanged;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final left = ((payload['left'] as List?) ?? []).map((e) => Map<String, dynamic>.from(e as Map)).toList();
    final right = ((payload['right'] as List?) ?? []).map((e) => Map<String, dynamic>.from(e as Map)).toList();
    final pairs = Map<String, dynamic>.from((response?['pairs'] as Map?) ?? {});
    return Column(children: [
      for (final l in left)
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 6),
          child: Row(children: [
            Expanded(child: MathText(l['text'] as String)),
            const Icon(Icons.arrow_forward, size: 18),
            const SizedBox(width: 8),
            Expanded(
              child: DropdownButton<String>(
                isExpanded: true,
                value: pairs[l['id']] as String?,
                hint: const Text('Tanlang'),
                items: [
                  for (final r in right) DropdownMenuItem(value: r['id'] as String, child: Text(r['text'] as String)),
                ],
                onChanged: enabled
                    ? (v) {
                        final next = {...pairs, l['id'] as String: v};
                        onChanged({'pairs': next});
                      }
                    : null,
              ),
            ),
          ]),
        ),
    ]);
  }
}

class _Ordering extends StatefulWidget {
  const _Ordering({super.key, required this.payload, required this.response, required this.onChanged, required this.enabled});

  final Map<String, dynamic> payload;
  final Map<String, dynamic>? response;
  final ValueChanged<Map<String, dynamic>> onChanged;
  final bool enabled;

  @override
  State<_Ordering> createState() => _OrderingState();
}

class _OrderingState extends State<_Ordering> {
  late List<Map<String, dynamic>> _items;

  @override
  void initState() {
    super.initState();
    _items = _ordered();
  }

  @override
  void didUpdateWidget(_Ordering old) {
    super.didUpdateWidget(old);
    if (old.response != widget.response) _items = _ordered();
  }

  /// Saqlangan tartib bo'lsa shu bo'yicha, aks holda serverdan kelgan tartib
  List<Map<String, dynamic>> _ordered() {
    final items = ((widget.payload['items'] as List?) ?? []).map((e) => Map<String, dynamic>.from(e as Map)).toList();
    final saved = (widget.response?['order'] as List?)?.cast<String>();
    if (saved == null || saved.length != items.length) return items;
    final byId = {for (final i in items) i['id'] as String: i};
    final result = [for (final id in saved) if (byId[id] != null) byId[id]!];
    return result.length == items.length ? result : items;
  }

  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const Text('Elementlarni sudrab to\'g\'ri tartibga qo\'ying'),
      const SizedBox(height: 8),
      ReorderableListView(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        buildDefaultDragHandles: widget.enabled,
        onReorderItem: (oldIndex, newIndex) {
          setState(() {
            final item = _items.removeAt(oldIndex);
            _items.insert(newIndex, item);
          });
          widget.onChanged({'order': _items.map((e) => e['id'] as String).toList()});
        },
        children: [
          for (var i = 0; i < _items.length; i++)
            Card(
              key: ValueKey(_items[i]['id']),
              child: ListTile(
                leading: CircleAvatar(radius: 14, child: Text('${i + 1}')),
                title: MathText(_items[i]['text'] as String),
                trailing: widget.enabled ? const Icon(Icons.drag_handle) : null,
              ),
            ),
        ],
      ),
    ]);
  }
}
