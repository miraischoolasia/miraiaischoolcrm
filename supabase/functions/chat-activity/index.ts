// Remembers when the parent and the team last wrote in each WhatsApp chat, so an automation can act
// on "the parent has not replied" and "the parent is waiting for us".
//
// Chatwoot (the WhatsApp inbox) calls this address for every message:
//   https://<project>.supabase.co/functions/v1/chat-activity?key=<the key shown in the CRM>
// The key lives in the database (chat_webhook_settings) and is checked there; an admin copies the
// whole address from Automations > Parent replies and pastes it into Chatwoot
// (Settings > Integrations > Webhooks, tick "Message created"). What the team writes is never kept. What a
// parent writes is kept for 35 days (cut at 500 characters) so a flow can wait for a reply and read it.
//
// A parent's first message that contains the phrase of a source rule also makes the lead (auto_lead_from_chat),
// so a new lead no longer waits for someone to have the inbox open.
//
// Every chat is listed on its lead (record_chat_channel): a Messenger / Instagram chat makes a lead with no phone.
//
// A message the school sends moves the lead of that chat from "new" to "contacted" (mark_lead_contacted_from_chat).
//
// Deploy (once, and after changes):
//   npx supabase functions deploy chat-activity --no-verify-jwt
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { parseChatwootEvent } from './logic.ts'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Method not allowed.' }, 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ ok: false, error: 'Not set up.' }, 503)
  }

  const key = new URL(req.url).searchParams.get('key') ?? ''
  if (key.length < 16 || key.length > 200) {
    return jsonResponse({ ok: false, error: 'The key is not right.' }, 401)
  }

  let payload: unknown
  try {
    payload = await req.json()
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid request body.' }, 400)
  }

  const parsed = parseChatwootEvent(payload)
  if (!parsed.ok) {
    // Chatwoot sends every kind of event; the ones that are not a message are not an error.
    return jsonResponse({ ok: true, ignored: parsed.reason })
  }
  const message = parsed.message

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

  // A parent's first message that holds an advert's keyword makes the lead right now, so the automations
  // that start from "a new lead" do not wait for someone to open the inbox. It runs before the message is
  // recorded: the database only treats a chat it has not seen yet as a first message. It never stops the
  // message from being recorded.
  if (message.direction === 'incoming' && message.text !== null && message.phone !== null) {
    const { data: leadId, error: leadError } = await admin.rpc('auto_lead_from_chat', {
      p_key: key,
      p_conversation_id: message.conversationId,
      p_contact_id: message.contactId,
      p_at: message.at.toISOString(),
      p_name: message.name,
      p_phone: message.phone,
      p_text: message.text,
    })
    if (leadError) {
      console.error('Could not make a lead', leadError.code, leadError.message)
    } else if (leadId !== null) {
      console.log('Lead', leadId, 'made from the first message of chat', message.conversationId)
    }
  }

  // The chat is listed on its lead: a Messenger / Instagram person becomes a lead of their own, and a
  // WhatsApp chat is listed on the lead of that contact or number. It never stops the message from being recorded.
  if (message.contactId !== null) {
    const { error: channelError } = await admin.rpc('record_chat_channel', {
      p_key: key,
      p_channel: message.channel,
      p_contact_id: message.contactId,
      p_conversation_id: message.conversationId,
      p_inbox_id: message.inboxId,
      p_inbox_name: message.inboxName,
      p_name: message.name,
      p_phone: message.phone,
      p_page_name: message.pageName,
      p_at: message.at.toISOString(),
      p_text: message.text,
    })
    if (channelError) {
      console.error('Could not list the chat on its lead', channelError.code, channelError.message)
    }
  }

  // Anything the school sends (a person in the inbox, an automation, the phone) means the parent has been
  // contacted: a lead still in "new" moves to "contacted". It never stops the message from being recorded.
  if (message.direction === 'outgoing') {
    const { data: movedId, error: stageError } = await admin.rpc('mark_lead_contacted_from_chat', {
      p_key: key,
      p_contact_id: message.contactId,
      p_phone: message.phone,
    })
    if (stageError) {
      console.error('Could not move the lead to contacted', stageError.code, stageError.message)
    } else if (movedId !== null) {
      console.log('Lead', movedId, 'is now contacted (the school wrote in chat', message.conversationId + ')')
    }
  }

  const { error } = await admin.rpc('record_chat_message', {
    p_key: key,
    p_conversation_id: message.conversationId,
    p_contact_id: message.contactId,
    p_direction: message.direction,
    p_at: message.at.toISOString(),
    p_name: message.name,
    p_phone: message.phone,
    p_opt_out: message.optOut,
    p_text: message.text,
  })

  if (error) {
    // 28000 is the database refusing the key.
    if (error.code === '28000') {
      return jsonResponse({ ok: false, error: 'The key is not right.' }, 401)
    }
    console.error('Could not record the message', error.code, error.message)
    return jsonResponse({ ok: false, error: 'Could not save.' }, 500)
  }

  return jsonResponse({ ok: true })
})
