import { isPubliclyListed, toProgramStatusFields } from '../../src/lib/programs/status.ts';
import { parseProgramSchedule, formatScheduleRange } from '../../src/lib/programs/schedule.ts';
import { formatAgeRange, formatGender } from '../../src/lib/programs/display.ts';

const text = value => typeof value === 'string' ? value.trim() : '';
export const validSlug = slug => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
export function directoryHref(slug) {
  return validSlug(slug) ? `/continuity/${slug}.html` : null;
}

// Explicit public allowlist: never serialize raw RPC rows, profiles, payment
// identifiers, enrollment counts, private classes or application information.
export function createDirectory(slug, snapshot, detailSnapshots, updatedAt = new Date().toISOString(), contactOverrides = {}) {
  if (!validSlug(slug) || snapshot?.error || snapshot?.mosque?.slug !== slug || !Array.isArray(snapshot.programs)) {
    throw new Error('No valid public class snapshot; existing directory retained.');
  }
  const classes = snapshot.programs.filter(p => p.is_active === true && isPubliclyListed(toProgramStatusFields(p))).map(p => {
    const result = detailSnapshots.get(p.id);
    if (!result || result.error || result.program?.id !== p.id) throw new Error('Incomplete class details; existing directory retained.');
    const program = result.program;
    const teacher = program.teacher ?? {};
    const details = result.details ?? {};
    const rows = parseProgramSchedule(program.schedule ?? null);
    const tracks = (result.tracks ?? []).filter(track => track.is_active !== false);
    const override = contactOverrides[p.id] ?? {};
    const contactPhones = [override.phone, teacher.phone_number, program.contact_phone, details.instructor_contact_phone, teacher.teacher_whatsapp_number];
    return {
      title: text(program.title),
      description: text(program.summary) || text(program.description),
      location: [text(program.location), text(program.room_area) || text(program.room)].filter(Boolean).join(' · '),
      audience: `${formatAgeRange(program.age_range_text ?? null)} · ${formatGender(program.audience_gender ?? null)}`,
      schedule: rows.map(row => `${row.date || row.day} · ${formatScheduleRange(row.start, row.end)}`),
      timezone: text(program.schedule_timezone),
      scheduleNotes: text(program.schedule_notes),
      status: text(program.lifecycle_status),
      pricing: priceLines(program),
      options: tracks.map(track => ({
        name: text(track.name),
        schedule: parseProgramSchedule(track.schedule ?? null).map(row => `${row.date || row.day} · ${formatScheduleRange(row.start, row.end)}`),
        pricing: priceLines(program, track),
        eligibility: text(track.eligibility_comment),
      })),
      contactName: text(program.contact_name) || text(details.instructor_display_name) || text(teacher.full_name),
      phone: contactPhones.map(text).find(value => /^\+?\d{7,15}$/.test(value.replace(/[^+\d]/g, ''))) ?? '',
      email: text(program.contact_email) || text(teacher.email),
    };
  }).sort((a, b) => a.title.localeCompare(b.title));
  return { slug, name: text(snapshot.mosque.short_name) || text(snapshot.mosque.name), updatedAt,
    timezone: classes.find(item => item.timezone)?.timezone || 'UTC', classes };
}

function priceLines(program, track) {
  if (program.is_paid === false) return ['Free'];
  if (program.payment_kind === 'manual') return [text(program.manual_payment_note) || 'Contact the teacher for payment details.'];
  const monthly = track?.pricing_override_enabled ? track.price_monthly_cents : program.price_monthly_cents;
  const annual = track?.pricing_override_enabled ? track.price_annual_cents : program.price_annual_cents;
  const money = cents => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 2, minimumFractionDigits: 0 }).format(cents / 100);
  return [
    program.offers_monthly_payment !== false && Number.isFinite(monthly) && monthly > 0 ? `${money(monthly)}/month` : '',
    program.offers_annual_payment && Number.isFinite(annual) && annual > 0 ? `${money(annual)}${program.is_ongoing ? '/year' : ' pay in full'}` : '',
  ].filter(Boolean);
}

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export function renderDirectory(directory) {
  if (!validSlug(directory.slug) || !directory.name || !Array.isArray(directory.classes)) throw new Error('Invalid directory.');
  const updated = directory.updatedAt ? new Intl.DateTimeFormat('en-CA', { timeZone: directory.timezone || 'UTC', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'shortOffset' }).format(new Date(directory.updatedAt)) : null;
  const cards = directory.classes.map(item => {
    const phone = text(item.phone).replace(/[^+\d]/g, '');
    const email = text(item.email);
    const mailto = /^[a-z0-9._+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email)
      ? `mailto:${email}?subject=${encodeURIComponent(`Class inquiry: ${item.title}`)}&body=${encodeURIComponent(`Assalamu alaikum,\n\nI would like to ask about ${item.title}.\n\nMy name:\nMy question or registration inquiry:\n\nThank you.`)}` : null;
    return `<article><header><h2>${escape(item.title)}</h2>${item.status === 'paused' ? '<span class="tag">Paused</span>' : ''}</header>
      ${item.description ? `<p class="description">${escape(item.description)}</p>` : ''}
      <dl>${item.audience ? `<div><dt>Who</dt><dd>${escape(item.audience)}</dd></div>` : ''}${item.location ? `<div><dt>Where</dt><dd>${escape(item.location)}</dd></div>` : ''}
      ${!item.options?.length && item.schedule?.length ? `<div><dt>When</dt><dd>${item.schedule.map(escape).join('<br>')}</dd></div>` : ''}
      ${!item.options?.length && item.pricing?.length ? `<div><dt>Fees</dt><dd>${item.pricing.map(escape).join('<br>')}</dd></div>` : ''}</dl>
      ${item.options?.length ? `<section class="options" aria-label="Class options">${item.options.map(option => `<div class="option"><h3>${escape(option.name)}</h3>${option.schedule?.length ? `<p>${option.schedule.map(escape).join('<br>')}</p>` : ''}${option.pricing?.length ? `<p class="price">${option.pricing.map(escape).join(' or ')}</p>` : ''}${option.eligibility ? `<p>${escape(option.eligibility)}</p>` : ''}</div>`).join('')}</section>` : ''}
      ${item.scheduleNotes ? `<p>${escape(item.scheduleNotes)}</p>` : ''}
      <footer>${item.contactName ? `<p class="contact">${escape(item.contactName)}</p>` : ''}<p class="contact-help">For inquiries or registration, contact the teacher directly.</p><div class="actions">
      ${mailto ? `<a class="primary" href="${escape(mailto)}">Email</a>` : ''}${/^\+?\d{7,15}$/.test(phone) ? `<a class="secondary" href="tel:${escape(phone)}">Call</a>` : ''}</div>
      ${email ? `<p class="detail">${escape(email)}</p>` : ''}${item.phone ? `<p class="detail">${escape(item.phone)}</p>` : ''}
      ${!mailto && !/^\+?\d{7,15}$/.test(phone) ? '<p>Contact the masjid directly for class inquiries.</p>' : ''}</footer></article>`;
  }).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex"><meta name="theme-color" content="#f5f6f3"><title>${escape(directory.name)} · Class directory</title>
  <style>.options{margin:0 0 20px}.option{padding:12px 0}.option+.option{border-top:1px solid #e8ece6}.option h3{margin:0;font-size:15px;line-height:1.4;font-weight:650}.option p{margin:5px 0 0;font-size:14px;color:#56655d}.option .price{color:#243b33;font-weight:600}.contact-help{margin:0 0 14px;font-size:14px;color:#56655d}.actions a:active{filter:brightness(.88);transform:translateY(1px)}@media(prefers-reduced-motion:no-preference){.actions a{transition:background .12s,transform .12s}}</style>
  <style>*{box-sizing:border-box}body{margin:0;background:#f5f6f3;color:#243b33;font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}main{max-width:920px;margin:auto;padding:max(28px,env(safe-area-inset-top)) 20px max(32px,env(safe-area-inset-bottom))}.top{display:flex;align-items:center;justify-content:space-between;gap:20px;padding-bottom:24px;border-bottom:1px solid #dce1da}.brand{font-size:19px;font-weight:650}.top a{color:#345c4c;font-size:14px;text-underline-offset:4px}h1{font-size:clamp(27px,5vw,38px);line-height:1.2;letter-spacing:-.03em;margin:30px 0 12px}.intro{max-width:650px;margin:0;color:#56655d}.notice{border-left:3px solid #9c7d41;padding:0 0 0 16px;margin:24px 0 32px}.notice p{margin:4px 0;color:#56655d;font-size:14px}.list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}article{min-width:0;border:1px solid #dce1da;border-radius:16px;background:#fff;padding:24px;display:flex;flex-direction:column}article header{display:flex;align-items:start;justify-content:space-between;gap:12px}h2{font-size:21px;line-height:1.3;letter-spacing:-.02em;margin:0}.tag{font-size:12px;background:#f2eee5;padding:2px 8px;border-radius:5px}.description{white-space:pre-line;color:#56655d;font-size:14px}dl{margin:16px 0}dl div{display:grid;grid-template-columns:54px 1fr;gap:10px;margin:10px 0;font-size:14px}dt{color:#78837c}dd{margin:0;overflow-wrap:anywhere}small{display:block;color:#78837c}article footer{margin-top:auto;padding-top:16px;border-top:1px solid #e8ece6}.contact{font-size:14px;font-weight:600;margin:0 0 12px}.actions{display:flex;flex-wrap:wrap;gap:10px}.actions a{display:inline-flex;align-items:center;justify-content:center;min-height:44px;border-radius:8px;padding:8px 24px;text-decoration:none;font-size:14px;font-weight:600}.primary{background:#17624f;color:#fff!important}.secondary{border:1px solid #bdc9c0;color:#285342}.detail{font-size:13px;color:#647267;overflow-wrap:anywhere;margin:8px 0 0}.bottom{margin:24px 0 0;font-size:12px;color:#78837c}a:focus-visible{outline:3px solid #a57b24;outline-offset:4px}@media(max-width:640px){.list{grid-template-columns:1fr}article{padding:20px}}</style></head>
  <body><main><div class="top"><span class="brand">${escape(directory.name)}</span><a href="/m/${escape(directory.slug)}/programs">Try the app</a></div>
  <h1>Classes &amp; contacts</h1><p class="intro">Having trouble opening the app? Class information and teacher contacts are available below.</p>
  <div class="notice" role="note"><strong>You can still contact your teacher</strong><p>Online registration and account features may be temporarily unavailable. Use Email or Call for inquiries and registration assistance.</p></div>
  <div class="list">${cards || '<p>Class details are not available here yet. Please contact the masjid directly.</p>'}</div>
  <p class="bottom">This is saved class information. Confirm current schedules, availability and fees with the teacher. Sending an inquiry does not confirm enrollment or change any payments.</p>
  <p class="bottom">${updated ? `Information checked ${escape(updated)}. · ` : ''}Powered by Madrasa</p></main></body></html>`.replace(/[ \t]+$/gm, '').trimEnd() + '\n';
}
