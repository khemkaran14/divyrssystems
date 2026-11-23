import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSite } from '../src/api/hooks';
import { QUIZ, quizTop } from '../src/engine/browse';
import { track } from '../src/analytics';
import { useAccount } from '../src/store/account';
import { Button, MiniLook, fonts, radius, useTheme } from '../src/ui';

export default function Quiz() {
  const t = useTheme();
  const site = useSite();
  const { width } = useWindowDimensions();
  const [answers, setAnswers] = useState<(string | string[])[]>([]);
  const qi = answers.length;
  const done = qi >= QUIZ.length;
  const top = done ? quizTop(answers[0] as string[], answers[1] as string, answers[2] as string, site) : [];
  const pick = (v: string | string[]) => {
    const next = [...answers, v];
    setAnswers(next);
    if (next.length === QUIZ.length) {
      track('quiz_finished', { vibe: String(next[1]) });
      useAccount.getState().saveVibe(String(next[1]));
    }
  };
  const tileW = Math.floor((width - 40 - 24 - 12) / 2);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.rani }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 18 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontFamily: fonts.monoMedium, fontSize: 11, letterSpacing: 1.3, color: 'rgba(255,255,255,0.9)' }}>STYLE QUIZ · 3 QUESTIONS</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Close quiz" onPress={() => router.back()} style={{ minHeight: 44, minWidth: 44, alignItems: 'flex-end', justifyContent: 'center' }}>
            <Text style={{ fontFamily: fonts.bodyBold, color: '#fff', fontSize: 15 }}>Close</Text>
          </Pressable>
        </View>
        <Text accessibilityRole="header" style={{ fontFamily: fonts.display, fontSize: 34, color: '#fff' }}>Find your <Text style={{ fontFamily: fonts.displayItalic }}>perfect look</Text></Text>
        <View style={{ flexDirection: 'row', gap: 8 }} accessibilityLabel={`Question ${Math.min(qi + 1, 3)} of 3`}>
          {QUIZ.map((_, i) => <View key={i} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: i < qi || done ? '#fff' : 'rgba(255,255,255,0.35)' }} />)}
        </View>
        {!done ? (
          <>
            <Text style={{ fontFamily: fonts.display, fontSize: 24, color: '#fff' }}>{QUIZ[qi].question}</Text>
            <View style={{ gap: 10 }}>
              {QUIZ[qi].answers.map(a => (
                <Pressable key={a.label} accessibilityRole="button" onPress={() => pick(a.value)}
                  style={({ pressed }) => ({ minHeight: 52, borderRadius: radius.pill, backgroundColor: pressed ? '#fff' : 'rgba(255,255,255,0.16)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.7)', justifyContent: 'center', paddingHorizontal: 20 })}>
                  {({ pressed }) => <Text style={{ fontFamily: fonts.bodyBold, fontSize: 16, color: pressed ? t.rani : '#fff' }}>{a.label}</Text>}
                </Pressable>
              ))}
            </View>
            {qi > 0 ? <Pressable accessibilityRole="button" onPress={() => setAnswers(answers.slice(0, -1))} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ fontFamily: fonts.bodyBold, color: '#fff' }}>← Back</Text></Pressable> : null}
          </>
        ) : (
          <>
            <Text style={{ fontFamily: fonts.display, fontSize: 24, color: '#fff' }}>Your top picks</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: radius.card, padding: 12 }}>
              {top.map(l => <MiniLook key={l.id} look={l} width={tileW} onPress={() => { router.back(); router.push(`/look/${l.id}`); }} />)}
            </View>
            <Button label="Take it again" kind="ghost" onPress={() => setAnswers([])} style={{ alignSelf: 'flex-start', backgroundColor: '#fff' }} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

