import assert from 'node:assert/strict';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import stringify from 'rehype-stringify';
import media, { mediaDescriptor } from '../src/lib/rehype-media.mjs';
const render = async md => String(await unified().use(remarkParse).use(remarkGfm).use(remarkRehype).use(media).use(stringify).process(md));
for (const url of ['https://www.youtube.com/embed/D6hjtY0cm3s?rel=1','https://youtu.be/D6hjtY0cm3s','https://www.youtube.com/watch?v=D6hjtY0cm3s','https://youtube.com/shorts/D6hjtY0cm3s','https://youtube.com/live/D6hjtY0cm3s']) {
  const html = await render(url); assert.match(html, /<iframe/); assert.match(html,/youtube-nocookie.com\/embed\/D6hjtY0cm3s/); assert.match(html,/<figcaption>/);
}
assert.match((await render('https://youtu.be/D6hjtY0cm3s?t=1m20s')),/start=80/);
for (const prefix of ['https://open.spotify.com/show/', 'https://open.spotify.com/embed/show/']) {
  const html = await render(prefix + '4ifa95kknLrUQblYTUMQ7T');
  assert.match(html, /src="https:\/\/open.spotify.com\/embed\/show\/4ifa95kknLrUQblYTUMQ7T"/);
  assert.match(html, /height="352"/); assert.match(html, /media-spotify/);
  assert.match(html, /href="https:\/\/open.spotify.com\/show\//);
}
for (const host of ['podcasts.apple.com', 'embed.podcasts.apple.com']) {
  const url = `https://${host}/us/podcast/anagoge-podcast/id1512482918`;
  assert.match(await render(url), /media-apple-show/);
  assert.match(await render(url), /height="450"/);
  const episode = await render(url + '?i=1000123456789&uo=4');
  assert.match(episode, /media-apple-episode/); assert.match(episode, /height="175"/);
  assert.match(episode, /id1512482918\?i=1000123456789/); assert.doesNotMatch(episode, /uo=4/);
}
for (const url of ['https://open.spotify.com.evil.test/show/4ifa95kknLrUQblYTUMQ7T', 'https://open.spotify.com/show/bad', 'https://podcasts.apple.com/us/podcast/test', 'https://embed.podcasts.apple.com/us/podcast/test/id123?i=bad']) assert.equal(mediaDescriptor(url), null);
assert.doesNotMatch(await render('Listen [here](https://open.spotify.com/show/4ifa95kknLrUQblYTUMQ7T).'), /<iframe/);
assert.doesNotMatch(await render('`https://embed.podcasts.apple.com/us/podcast/anagoge-podcast/id1512482918`'), /<iframe/);
for (const url of ['javascript:alert(1)','https://youtube.com.evil.test/watch?v=D6hjtY0cm3s','https://youtube.com/watch?v=bad','https://example.com/article','//example.com/a.jpg']) assert.equal(mediaDescriptor(url), null);
assert.doesNotMatch(await render('Watch [this](https://youtu.be/D6hjtY0cm3s) today.'),/<iframe/);
assert.doesNotMatch(await render('`https://youtu.be/D6hjtY0cm3s`'),/<iframe/);
assert.doesNotMatch(await render('```\nhttps://youtu.be/D6hjtY0cm3s\n```'),/<iframe/);
assert.match(await render('[A landscape](/uploads/example.jpg)'),/alt="A landscape"/);
assert.match(await render('https://example.com/photo.webp?width=600'),/<img/);
assert.match(await render('https://example.com/video.mp4'),/<video[^>]+controls/);
assert.match(await render('https://example.com/audio.mp3'),/<audio[^>]+controls/);
assert.equal((await render('![Already an image](/uploads/a.jpg)')).match(/<img/g).length,1);
console.log('Media fixtures passed: URL forms, timestamps, native media, safe hosts, inline links and code preservation');
