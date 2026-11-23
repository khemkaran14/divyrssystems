import rulesJson from '../src/content/rules.json';
import type { Rule } from '../src/content/types';
import { Body, Card, Screen, Section, useTheme } from '../src/ui';
import { Text } from 'react-native';
import { fonts } from '../src/ui';

const NUM = ['i', 'ii', 'iii', 'iv', 'v', 'vi'];

export default function Rules() {
  const t = useTheme();
  return (
    <Screen edges={[]} contentStyle={{ padding: 16, gap: 12 }}>
      {(rulesJson as Rule[]).map((r, i) => (
        <Card key={r.title}>
          <Text style={{ fontFamily: fonts.displayItalic, fontSize: 28, color: t.rani }}>{NUM[i]}.</Text>
          <Section style={{ fontSize: 22 }}>{r.title}</Section>
          <Body>{r.body}</Body>
        </Card>
      ))}
    </Screen>
  );
}
