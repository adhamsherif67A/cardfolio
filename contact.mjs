export const fields = {
  name: 'Name', company: 'Company', title: 'Job title', email: 'Email',
  phone: 'Work phone', mobile: 'Mobile phone', website: 'Website', notes: 'Notes',
};

export function readContact(text) {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const email = text.match(/[\w.+%-]+@[\w.-]+\.[a-z]{2,}/i)?.[0] ?? '';
  const domain = email.split('@')[1]?.split('.')[0] ?? '';
  const numbers = lines.flatMap(line => {
    const match = line.match(/(?:\+\s*)?\d[\d(). -]{5,}\d/g) ?? [];
    return match
      .filter(value => value.replace(/\D/g, '').length >= 7 && value.replace(/\D/g, '').length <= 15)
      .map(value => ({ value, mobile: /\b(mob(?:ile)?|cell|m)\s*[:.+-]/i.test(line) }));
  });
  const titleIndex = lines.findIndex(line =>
    /\b(manager|engineer|developer|designer|director|founder|officer|lead|executive|consultant|specialist|president|analyst|architect|ceo|cto)\b/i.test(line)
    && !/[@\d]/.test(line));
  const names = lines.filter(line =>
    /^[\p{Lu}][\p{L}'’.-]+(?:\s+[\p{Lu}][\p{L}'’.-]+){1,4}$/u.test(line)
    && /\p{Ll}/u.test(line) && !/\b(email|phone|street|city|group|inc|ltd)\b/i.test(line));
  const company = domain && lines.find(line => line.replace(/[^a-z\d]/gi, '').toLowerCase() === domain);
  const mobile = numbers.find(number => number.mobile)?.value ?? numbers[1]?.value ?? '';
  const websites = text.replace(/[\w.+%-]+@[\w.-]+\.[a-z]{2,}/gi, '').match(/(?:https?:\/\/|www\.)[a-z\d][a-z\d./_%?&=#~-]*/gi);
  return {
    name: names.includes(lines[titleIndex - 1]) ? lines[titleIndex - 1] : names.find(line => line !== lines[titleIndex]) ?? '',
    company: company || domain,
    title: lines[titleIndex] ?? '',
    email,
    phone: numbers.find(number => number.value !== mobile)?.value ?? '',
    mobile,
    website: websites?.[0]?.replace(/[.,]+$/, '') ?? '',
    notes: '',
  };
}

