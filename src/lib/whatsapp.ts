// A wa.me link that opens a WhatsApp chat with a phone number. Numbers written
// the local way (012-345 6789) are taken as Malaysian; numbers that already
// carry a country code (+65 9123 4567, 6012...) are used as they are. Null when
// there are not enough digits to be a phone number.
export function getWhatsAppUrl(phone: string | null | undefined, message = '') {
  let digits = (phone ?? '').replace(/\D/g, '')
  if (digits.startsWith('00')) {
    digits = digits.slice(2)
  } else if (digits.startsWith('0')) {
    digits = `60${digits.slice(1)}`
  }
  if (digits.length < 9 || digits.length > 15) {
    return null
  }
  const text = message.trim() ? `?text=${encodeURIComponent(message.trim())}` : ''
  return `https://wa.me/${digits}${text}`
}
