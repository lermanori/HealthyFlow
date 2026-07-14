import { supabase } from './client'

// Assistant chat-history persistence (conversations + their messages).
// Composed into the `db` facade in supabase-client.ts.
export const assistantConversationsDb = {
  async getAssistantConversations(userId: string) {
    const { data: conversations, error: conversationsError } = await supabase
      .from('assistant_conversations')
      .select('id, title, model, created_at, updated_at')
      .eq('user_id', userId)
      .is('archived_at', null)
      .order('updated_at', { ascending: false })
      .limit(20)

    if (conversationsError) throw conversationsError
    if (!conversations || conversations.length === 0) return []

    const ids = conversations.map(conversation => conversation.id)
    const { data: messages, error: messagesError } = await supabase
      .from('assistant_messages')
      .select('id, conversation_id, role, content, display_content, hidden, attachment, tool_events, pending_actions, error, created_at, position')
      .eq('user_id', userId)
      .in('conversation_id', ids)
      .order('position', { ascending: true })

    if (messagesError) throw messagesError

    const messagesByConversation = new Map<string, any[]>()
    for (const message of messages ?? []) {
      const current = messagesByConversation.get(message.conversation_id) ?? []
      current.push({
        id: message.id,
        role: message.role,
        content: message.content,
        displayContent: message.display_content ?? undefined,
        hidden: message.hidden || undefined,
        attachment: message.attachment ?? undefined,
        toolEvents: message.tool_events ?? undefined,
        pendingActions: message.pending_actions ?? undefined,
        error: message.error || undefined,
        createdAt: message.created_at,
      })
      messagesByConversation.set(message.conversation_id, current)
    }

    return conversations.map(conversation => ({
      id: conversation.id,
      title: conversation.title,
      model: conversation.model,
      createdAt: conversation.created_at,
      updatedAt: conversation.updated_at,
      messages: messagesByConversation.get(conversation.id) ?? [],
    }))
  },

  async upsertAssistantConversation(userId: string, conversation: {
    id: string
    title: string
    model: string
    createdAt?: string
    updatedAt?: string
    messages: Array<{
      id: string
      role: 'user' | 'assistant'
      content: string
      displayContent?: string
      hidden?: boolean
      attachment?: unknown
      toolEvents?: unknown
      pendingActions?: unknown
      error?: boolean
      createdAt?: string
    }>
  }) {
    const now = new Date().toISOString()
    const createdAt = conversation.createdAt ?? now
    const updatedAt = conversation.updatedAt ?? now

    const { error: conversationError } = await supabase
      .from('assistant_conversations')
      .upsert({
        id: conversation.id,
        user_id: userId,
        title: conversation.title,
        model: conversation.model,
        created_at: createdAt,
        updated_at: updatedAt,
        archived_at: null,
      })

    if (conversationError) throw conversationError

    const messageRows = conversation.messages.map((message, index) => ({
      id: message.id,
      conversation_id: conversation.id,
      user_id: userId,
      position: index,
      role: message.role,
      content: message.content,
      display_content: message.displayContent ?? null,
      hidden: Boolean(message.hidden),
      attachment: message.attachment ?? null,
      tool_events: message.toolEvents ?? null,
      pending_actions: message.pendingActions ?? null,
      error: Boolean(message.error),
      created_at: message.createdAt ?? now,
    }))

    const { error: deleteError } = await supabase
      .from('assistant_messages')
      .delete()
      .eq('user_id', userId)
      .eq('conversation_id', conversation.id)

    if (deleteError) throw deleteError

    if (messageRows.length > 0) {
      const { error: insertError } = await supabase
        .from('assistant_messages')
        .insert(messageRows)

      if (insertError) throw insertError
    }

    return {
      id: conversation.id,
      title: conversation.title,
      model: conversation.model,
      createdAt,
      updatedAt,
      messages: conversation.messages,
    }
  },

  async archiveAssistantConversation(userId: string, conversationId: string) {
    const { error } = await supabase
      .from('assistant_conversations')
      .update({ archived_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('id', conversationId)

    if (error) throw error
  },
}
