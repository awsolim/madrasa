import test from 'node:test';
import assert from 'node:assert/strict';
import { hasRemoteMatch } from 'next/dist/shared/lib/match-remote-pattern.js';
import { canHaveProfilePhoto, profileImageRemotePatterns, supportedProfileImage } from '../src/lib/profile-images.ts';

test('Google account photos and Supabase photos match the Next image allowlist', () => {
  for (const src of [
    'https://lh3.googleusercontent.com/a/example=s96-c',
    'https://lh6.googleusercontent.com/a-/example?sz=128',
    'https://project.supabase.co/storage/v1/object/public/avatars/person.png',
  ]) {
    const accepted = supportedProfileImage(src);
    assert.ok(accepted);
    assert.equal(hasRemoteMatch([], profileImageRemotePatterns, new URL(accepted)), true);
  }
});

test('unsupported and malformed profile photos use the fallback instead of reaching Next Image', () => {
  for (const src of [null, '', 'not a URL', 'javascript:alert(1)', '//untrusted.test/avatar', '/\\untrusted.test/avatar',
    'https://untrusted.test/avatar', 'http://lh3.googleusercontent.com/a/photo', 'https://lh3.googleusercontent.com:444/photo',
    'https://lh3.googleusercontent.com.untrusted.test/photo', 'https://user:password@lh3.googleusercontent.com/photo']) {
    assert.equal(supportedProfileImage(src), null);
  }
  assert.equal(supportedProfileImage('/avatars/person.png'), '/avatars/person.png');
});

test('family and unresolved accounts cannot use custom photos; staff can', () => {
  for (const role of ['student', 'parent', 'child', null, undefined, '']) assert.equal(canHaveProfilePhoto(role), false);
  for (const role of ['teacher', 'admin']) assert.equal(canHaveProfilePhoto(role), true);
  assert.equal(supportedProfileImage('data:image/jpeg;base64,YWJjZA=='), 'data:image/jpeg;base64,YWJjZA==');
  assert.equal(supportedProfileImage('data:image/svg+xml;base64,YWJjZA=='), null);
});
