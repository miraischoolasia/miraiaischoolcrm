import { type ComponentRef, useCallback, useEffect, useRef, useState } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useFocusEffect } from 'expo-router'

import {
  type ChatContact,
  type ChatMessage,
  fetchChatMessages,
  markChatRead,
  maxMessageLength,
  mergeMessages,
  messageTime,
  roleLabel,
  seenByStaff,
  sendChatMessage,
  useAppChat,
} from '@/lib/appChat'
import { useSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import { colors, Empty, Loading, Muted, Screen, Title } from '@/ui/kit'

// Chat: the child's class teachers and consultant on the left (or as the
// whole page on a phone), the conversation with the one picked on the right.
export default function Chat() {
  const { home, branding } = useSession()
  const chat = useAppChat()
  const { width } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const [pickedId, setPickedId] = useState<number | null>(null)
  // The tab stays alive behind the others; messages count as read only while it is in front.
  const [inFront, setInFront] = useState(false)
  useFocusEffect(
    useCallback(() => {
      setInFront(true)
      return () => setInFront(false)
    }, []),
  )
  const wide = width >= 760
  const color = branding.accentColor

  if (!home || chat.checking) return <Screen>{<Loading />}</Screen>
  if (home.viewer !== 'student' || !chat.on) {
    return (
      <Screen>
        <Title>Chat</Title>
        <Empty>{home.viewer !== 'student' ? 'Chat is for the student’s own login.' : 'Chat is not open at your school yet.'}</Empty>
      </Screen>
    )
  }

  const picked = chat.contacts.find((contact) => contact.staff_id === pickedId) ?? (wide ? (chat.contacts[0] ?? null) : null)
  const list = (
    <ContactList contacts={chat.contacts} loaded={chat.loaded} pickedId={picked?.staff_id ?? null} color={color} onPick={setPickedId} />
  )

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      {wide ? (
        <View style={styles.row}>
          <View style={styles.listColumn}>{list}</View>
          <View style={styles.threadColumn}>
            {picked ? <Thread key={picked.staff_id} contact={picked} color={color} inFront={inFront} onSent={chat.reload} /> : <Empty>Pick someone to chat with.</Empty>}
          </View>
        </View>
      ) : picked ? (
        <Thread key={picked.staff_id} contact={picked} color={color} inFront={inFront} onSent={chat.reload} onBack={() => setPickedId(null)} />
      ) : (
        list
      )}
    </View>
  )
}

function ContactList({
  contacts,
  loaded,
  pickedId,
  color,
  onPick,
}: {
  contacts: ChatContact[]
  loaded: boolean
  pickedId: number | null
  color: string
  onPick: (staffId: number) => void
}) {
  return (
    <ScrollView contentContainerStyle={styles.listInner}>
      <Title>Chat</Title>
      <Muted>Write to your teachers or your consultant.</Muted>
      {!loaded && <Loading />}
      {loaded && contacts.length === 0 && <Empty>No teachers to chat with yet.</Empty>}
      {contacts.map((contact) => (
        <Pressable
          key={contact.staff_id}
          accessibilityRole="button"
          accessibilityLabel={`Chat with ${contact.staff_name}`}
          onPress={() => onPick(contact.staff_id)}
          style={({ pressed }) => [styles.contact, contact.staff_id === pickedId && { borderColor: color }, pressed && styles.pressed]}
        >
          <View style={[styles.avatar, { backgroundColor: color }]}>
            <Text style={styles.avatarText}>{contact.staff_name.slice(0, 1).toUpperCase()}</Text>
          </View>
          <View style={styles.contactText}>
            <View style={styles.contactTop}>
              <Text style={styles.name} numberOfLines={1}>
                {contact.staff_name}
              </Text>
              {contact.last_message_at && <Text style={styles.time}>{messageTime(contact.last_message_at)}</Text>}
            </View>
            <Text style={styles.role} numberOfLines={1}>
              {roleLabel(contact)}
              {contact.classes ? ` · ${contact.classes}` : ''}
              {contact.can_send ? '' : ' · old messages'}
            </Text>
            {contact.last_preview && (
              <Text style={[styles.preview, contact.unread > 0 && styles.previewUnread]} numberOfLines={1}>
                {contact.last_sender === 'student' ? 'You: ' : ''}
                {contact.last_preview}
              </Text>
            )}
          </View>
          {contact.unread > 0 && (
            <View style={[styles.badge, { backgroundColor: color }]}>
              <Text style={styles.badgeText}>{contact.unread > 99 ? '99+' : contact.unread}</Text>
            </View>
          )}
        </Pressable>
      ))}
    </ScrollView>
  )
}

function Thread({
  contact,
  color,
  inFront,
  onSent,
  onBack,
}: {
  contact: ChatContact
  color: string
  inFront: boolean
  onSent: () => void
  onBack?: () => void
}) {
  const threadId = contact.thread_id
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(threadId !== null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const list = useRef<ComponentRef<typeof ScrollView> | null>(null)

  // The messages, then every new one live; the child has read them.
  useEffect(() => {
    if (threadId === null) return
    let alive = true
    fetchChatMessages(threadId)
      .then((rows) => {
        if (!alive) return
        setMessages(rows)
        setLoading(false)
      })
      .catch((reason: Error) => {
        if (!alive) return
        setError(reason.message)
        setLoading(false)
      })
    const channel = supabase
      .channel(`app-chat-messages-${threadId}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'app_chat_messages', filter: `thread_id=eq.${threadId}` }, (change) => {
        setMessages((current) => mergeMessages(current, [change.new as ChatMessage]))
      })
      .subscribe()
    return () => {
      alive = false
      void supabase.removeChannel(channel)
    }
  }, [threadId])

  useEffect(() => {
    if (inFront && threadId !== null && contact.unread > 0) void markChatRead(threadId)
  }, [inFront, threadId, contact.unread])

  useEffect(() => {
    const timer = setTimeout(() => list.current?.scrollToEnd({ animated: true }), 50)
    return () => clearTimeout(timer)
  }, [messages.length])

  async function send() {
    const text = draft.trim()
    if (!text || sending) return
    setSending(true)
    setError(null)
    try {
      const thread = await sendChatMessage(contact.staff_id, text)
      setDraft('')
      setMessages(await fetchChatMessages(thread))
      onSent()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not send. Try again.')
    } finally {
      setSending(false)
    }
  }

  const read = seenByStaff(contact, messages)
  const tooLong = draft.length > maxMessageLength

  return (
    <KeyboardAvoidingView style={styles.thread} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.head}>
        {onBack && (
          <Pressable accessibilityRole="button" accessibilityLabel="Back to chats" onPress={onBack} style={styles.back}>
            <Text style={styles.backText}>‹</Text>
          </Pressable>
        )}
        <View style={[styles.avatar, { backgroundColor: color }]}>
          <Text style={styles.avatarText}>{contact.staff_name.slice(0, 1).toUpperCase()}</Text>
        </View>
        <View style={styles.contactText}>
          <Text style={styles.name} numberOfLines={1}>
            {contact.staff_name}
          </Text>
          <Text style={styles.role} numberOfLines={1}>
            {roleLabel(contact)}
            {contact.classes ? ` · ${contact.classes}` : ''}
          </Text>
        </View>
      </View>

      <ScrollView ref={list} style={styles.messages} contentContainerStyle={styles.messagesInner}>
        {loading && <Loading />}
        {!loading && messages.length === 0 && <Empty>{`Say hi to ${contact.staff_name}!`}</Empty>}
        {messages.map((message) => {
          const mine = message.sender === 'student'
          return (
            <View key={message.id} style={[styles.bubble, mine ? [styles.mine, { backgroundColor: color }] : styles.theirs]}>
              <Text style={[styles.bubbleText, mine && styles.mineText]}>{message.body}</Text>
              <Text style={[styles.bubbleTime, mine && styles.mineTime]}>{messageTime(message.created_at)}</Text>
            </View>
          )
        })}
        {read && <Text style={styles.read}>Read</Text>}
      </ScrollView>

      {error && <Text style={styles.error}>{error}</Text>}
      {contact.can_send ? (
        <View style={styles.composer}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={`Message ${contact.staff_name}`}
            placeholderTextColor={colors.muted}
            style={styles.input}
            multiline
            maxLength={maxMessageLength + 1}
            onKeyPress={(event) => {
              const key = event.nativeEvent as { key: string; shiftKey?: boolean }
              if (Platform.OS === 'web' && key.key === 'Enter' && !key.shiftKey) {
                event.preventDefault()
                void send()
              }
            }}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send"
            disabled={!draft.trim() || sending || tooLong}
            onPress={() => void send()}
            style={[styles.send, { backgroundColor: color }, (!draft.trim() || sending || tooLong) && styles.disabled]}
          >
            <Text style={styles.sendText}>{sending ? '…' : 'Send'}</Text>
          </Pressable>
        </View>
      ) : (
        <Text style={styles.closed}>{`${contact.staff_name} no longer teaches your class. You can still read the old messages.`}</Text>
      )}
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  row: { flex: 1, flexDirection: 'row', maxWidth: 1100, width: '100%', alignSelf: 'center' },
  listColumn: { width: 340, borderRightWidth: 1, borderColor: colors.border },
  threadColumn: { flex: 1 },
  listInner: { padding: 16, gap: 10, paddingBottom: 24 },
  contact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  pressed: { opacity: 0.7 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  contactText: { flex: 1, minWidth: 0 },
  contactTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flex: 1, color: colors.text, fontSize: 16, fontWeight: '800' },
  time: { color: colors.muted, fontSize: 12 },
  role: { color: colors.muted, fontSize: 13 },
  preview: { color: colors.muted, fontSize: 14, marginTop: 2 },
  previewUnread: { color: colors.text, fontWeight: '700' },
  badge: { minWidth: 24, height: 24, borderRadius: 12, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  thread: { flex: 1, backgroundColor: colors.background },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: colors.card, borderBottomWidth: 1, borderColor: colors.border },
  back: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 32, color: colors.text, lineHeight: 34 },
  messages: { flex: 1 },
  messagesInner: { padding: 16, gap: 8 },
  bubble: { maxWidth: '80%', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18 },
  mine: { alignSelf: 'flex-end', borderBottomRightRadius: 6 },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderBottomLeftRadius: 6 },
  bubbleText: { color: colors.text, fontSize: 16, lineHeight: 22 },
  mineText: { color: '#fff' },
  bubbleTime: { color: colors.muted, fontSize: 11, marginTop: 3, alignSelf: 'flex-end' },
  mineTime: { color: 'rgba(255,255,255,0.8)' },
  read: { alignSelf: 'flex-end', color: colors.muted, fontSize: 12, marginTop: -2 },
  error: { color: colors.bad, paddingHorizontal: 16, paddingBottom: 6 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    padding: 10,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 140,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.background,
  },
  send: { height: 44, paddingHorizontal: 18, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  sendText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  disabled: { opacity: 0.4 },
  closed: { padding: 16, color: colors.muted, textAlign: 'center', backgroundColor: colors.card },
})
