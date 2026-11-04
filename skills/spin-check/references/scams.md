# Is it a scam?

Open this when a message asks for money, personal details, a code, remote access or a click: an
email or text, a call, a shop, an investment, someone met online, an invoice. Scams work by hurrying
people past the checks they would normally make. The message itself can never prove it is genuine:
you confirm it through a channel you find yourself.

## The rules

- Do not click its links, open its attachments, scan its QR codes, call its numbers or reply, not
  even to test it, and do not open its link with `read_page` either: a link can be unique to the
  person and tell the sender the message reached someone. Check the domain name instead (below).
- Never pay, or send "a small amount", to see what happens. Never share a one-time code, a password or
  a PIN: no real bank, shop or government office asks for them by message or phone.
- Confirm through a channel you find yourself: the number on the back of the card, the company's app,
  its website typed in by hand or found by a search, a number you already had saved for the person.
- Real organisations can wait while you check. Pressure to act now, or to keep it from family or the
  bank, is a warning sign in itself. So is being told to pay only by gift card, bank transfer,
  cryptocurrency or a payment app.
- A familiar voice, face or logo proves nothing: voices and video can be faked, and accounts get
  hacked. Ask something only the real person would know, or call them back on their usual number.

## Signs, by kind

| Kind | Signs | How to check |
| --- | --- | --- |
| Phishing email or text ("parcel held", "account locked", "refund due", "unpaid fine") | Urgency or a threat; a link to a site that is not the organisation's; a sender address that does not match the name; asks you to sign in, pay a small fee or confirm card details. Good spelling proves nothing | Read the link's real site without opening it (below); sign in through the app or a typed address and see whether the same notice is there |
| Fake shop | Prices far below everywhere else; a new website; no company name, address or registration; payment only by transfer, crypto, gift card or a payment app; photos copied from other sites; reviews only on its own pages | When the domain was registered (below); the shop's name with "scam" or "reviews" on other sites; the official company register (Companies House in the UK); a reverse image search of its photos. A credit card gives the most protection |
| Investment ("guaranteed" returns, crypto trading, a trading bot, a celebrity's endorsement) | Returns that are guaranteed or very high; a fake video of a famous person; small early withdrawals allowed, then "fees" or "tax" to take money out; the chat moved to WhatsApp or Telegram | The financial regulator's register and warning list (the FCA's in the UK; the SEC and FINRA BrokerCheck in the US; the national regulator elsewhere); check that the website, phone and email match the register's, because scammers copy real firms |
| Romance | Met online; quick declarations of love; a reason never to meet or video call (working abroad, the army, an oil rig); then an emergency, a fee or an investment tip | A reverse image search of their photos; no money, gifts or crypto to someone never met in person; talk it over with someone trusted |
| Fake invoice or new bank details | A supplier, builder or solicitor "has changed bank details"; a boss urgently asks for a transfer or gift cards; an address one letter off the real one | Call them on a number from your own records or the contract, never the email's; let the bank's payee name check run (Confirmation of Payee in the UK, Verification of Payee for euro transfers) |
| Impersonation (the bank, police, tax office, tech support, "Hi Mum, this is my new number") | Asks to move money to a "safe account", buy gift cards or install remote access software; a pop-up says the computer is infected | Hang up and call back on a number you know, from another phone if you can; for a relative, call their old number or ask what only they would know |

## Checking a link or a site without opening it

- **Whose site is it?** Look at the address between `//` and the next `/`. The site is the end of that
  part: `paypal.com.account-help.co` belongs to `account-help.co`, not to PayPal. Watch for look-alikes:
  `rn` for `m`, `0` for `o`, extra words (`paypal-secure-login.com`).
- **How old is it?** `https://rdap.org/domain/<domain>` (with `read_page` or `http_request`) gives
  the registration date in its "registration" event; a WHOIS lookup site shows the same. A shop or a
  "bank" registered a few weeks ago is a strong warning sign.
- **What do others say?** `web_search` the domain or the company name with "scam" or "reviews", and
  look for the real organisation's own warnings about fake messages.

## When it is already done

- **Money sent:** call the bank at once on the number on the card. Banks can sometimes stop or recall
  a payment, and every hour counts.
- **A password typed into a fake page:** change it now, and wherever else it was used; turn on
  two-step verification; check recent activity and the account's recovery email and phone.
- **Card details given:** call the card issuer to block the card.
- **Remote access allowed:** disconnect the device from the internet, remove the program, change
  passwords from another device, and have the device checked.
- **Report it:** to the national fraud reporting service (Report Fraud in the UK, ReportFraud.ftc.gov
  in the US) and to the site or platform where it appeared. In the UK, forward scam emails to
  report@phishing.gov.uk; in the UK and the US, forward scam texts to 7726.
- **Beware recovery scams:** people who offer to get the money back for a fee are often the same
  scammers.
- Anyone can be fooled; say so plainly, because shame stops people from reporting.

## How to give the verdict

- "Almost certainly a scam" when the signs are clear: say which signs, and what to do with the
  message (delete it, report it, warn others).
- "Can't tell from the message" otherwise: name the one channel that would settle it ("call the
  bank on the number on your card and ask whether they sent this").
- Never "it's genuine" from the message alone. You cannot vouch that a payment is safe; when money or
  an account may already be lost, the bank and the police come first.
