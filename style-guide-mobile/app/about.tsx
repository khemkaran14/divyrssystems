import { Body, Card, Screen, Small, Strong } from '../src/ui';

export default function About() {
  return (
    <Screen edges={[]} contentStyle={{ padding: 16, gap: 12 }}>
      <Card>
        <Strong>The Ultimate Style Guide</Strong>
        <Body>A women’s style guide for Indian and global styles, ethnic, fusion and western, by occasion. Style real outfits on a real photo in the Dressing Room.</Body>
      </Card>
      <Card>
        <Strong>About the photos</Strong>
        <Body>The model and look photos in this app are AI-generated (made with Gemini and ChatGPT). They are not photos of real people.</Body>
      </Card>
      <Small>Your account works on the app and the website. We store your name, email and saved looks only. No tracking, no data sold.</Small>
    </Screen>
  );
}
