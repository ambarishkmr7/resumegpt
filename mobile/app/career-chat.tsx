import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../src/api/client";
import { errorMessage } from "../src/api/errors";
import type { AgentMessage } from "../src/api/types";
import { BackHeader } from "../src/components/ui/BackHeader";
import { Chip, TextField, toast } from "../src/components/ui";
import { color, fontFamily, radius, space, text } from "../src/theme";
import Markdown from "react-native-markdown-display";

const SUGGESTIONS = [
  "🔍 Find remote Python jobs",
  "🎓 Entry-level data science roles",
  "🏢 Jobs at Google",
];

export default function CareerChatScreen() {
  const qc = useQueryClient();
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const conversations = useQuery({
    queryKey: ["agent-conversations"],
    queryFn: api.agentConversations,
  });

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [messages, sending]);

  const loadThread = async (id: string) => {
    setThreadId(id);
    setLoadingHistory(true);
    try {
      const detail = await api.agentConversation(id);
      setMessages(detail.messages || []);
    } catch (e) {
      toast.error(errorMessage(e));
      setMessages([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  const startNewChat = () => {
    setThreadId(null);
    setMessages([]);
  };

  const send = async () => {
    const content = input.trim();
    if (!content || sending) return;
    const userMessage: AgentMessage = { role: "user", content };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setSending(true);
    try {
      const data = await api.agentChat(content, threadId);
      const isNewThread = !threadId && !!data.thread_id;
      if (isNewThread) {
        setThreadId(data.thread_id);
        void qc.invalidateQueries({ queryKey: ["agent-conversations"] });
      }
      if (data.messages?.length) setMessages(data.messages);
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, something went wrong. Please try again." },
      ]);
      toast.error(errorMessage(e));
      setInput(content);
    } finally {
      setSending(false);
    }
  };

  const removeThread = (id: string, title: string) => {
    Alert.alert(`Delete "${title}"?`, "This chat can't be recovered.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await api.deleteAgentConversation(id);
            if (threadId === id) startNewChat();
            void qc.invalidateQueries({ queryKey: ["agent-conversations"] });
          } catch (e) {
            toast.error(errorMessage(e));
          }
        },
      },
    ]);
  };

  const visible = messages.filter(
    (m) => (m.role === "user" || m.role === "assistant") && (m.content || "").trim(),
  );
  const showTyping = sending && visible[visible.length - 1]?.role !== "assistant";
  const threads = conversations.data?.conversations ?? [];

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: color.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      <BackHeader title="Career Assistant" />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.threadBar}
        contentContainerStyle={styles.threadBarContent}
      >
        <Chip label="+ New chat" tint={color.ctaSoft} textColor={color.ctaDark} onPress={startNewChat} />
        {threads.map((t) => (
          <Chip
            key={t.thread_id}
            label={t.title || "Chat"}
            selected={threadId === t.thread_id}
            onPress={() => void loadThread(t.thread_id)}
            onRemove={() => removeThread(t.thread_id, t.title || "Chat")}
          />
        ))}
      </ScrollView>

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={styles.messages}
        keyboardShouldPersistTaps="handled"
      >
        {loadingHistory ? (
          <ActivityIndicator color={color.primary} style={{ marginTop: space.xxl }} />
        ) : visible.length === 0 && !sending ? (
          <View style={styles.welcome}>
            <Text style={{ fontSize: 44 }}>🤖</Text>
            <Text style={[text.title, { textAlign: "center", marginTop: space.md }]}>
              Hi! I&apos;m your Career Assistant
            </Text>
            <Text style={[text.caption, { textAlign: "center", marginTop: space.xs, marginBottom: space.lg }]}>
              I can help you find jobs, research companies, and give career advice.
            </Text>
            <View style={styles.suggestRow}>
              {SUGGESTIONS.map((s) => (
                <Chip key={s} label={s} tint={color.surfaceSunken} onPress={() => setInput(s.replace(/^\S+\s/, ""))} />
              ))}
            </View>
          </View>
        ) : (
          visible.map((m, i) => <Bubble key={i} message={m} />)
        )}
        {showTyping ? (
          <View style={[styles.bubbleRow]}>
            <View style={styles.avatar}>
              <Text>🤖</Text>
            </View>
            <View style={[styles.bubble, styles.bubbleAssistant]}>
              <ActivityIndicator size="small" color={color.primary} />
            </View>
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.inputBar}>
        <View style={{ flex: 1 }}>
          <TextField
            value={input}
            onChangeText={setInput}
            placeholder="Ask me about jobs, companies, career advice…"
            onSubmitEditing={() => void send()}
            returnKeyType="send"
            editable={!sending}
          />
        </View>
        <Chip
          label={sending ? "…" : "Send"}
          tint={input.trim() ? color.cta : color.surfaceSunken}
          textColor={input.trim() ? color.white : color.inkFaint}
          onPress={() => void send()}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

function Bubble({ message }: { message: AgentMessage }) {
  const isUser = message.role === "user";
  return (
    <View style={[styles.bubbleRow, isUser && styles.bubbleRowUser]}>
      <View style={[styles.avatar, isUser && styles.avatarUser]}>
        <Text>{isUser ? "👤" : "🤖"}</Text>
      </View>
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
        {isUser ? (
          <Text style={styles.bubbleTextUser}>{message.content}</Text>
        ) : (
          <Markdown style={markdownStyles}>{message.content}</Markdown>
        )}
      </View>
    </View>
  );
}

const markdownStyles = StyleSheet.create({
  body: { ...text.body, color: color.ink, marginTop: 0, marginBottom: 0 },
  paragraph: { marginTop: 0, marginBottom: space.xs },
  link: { color: color.primary },
});

const styles = StyleSheet.create({
  threadBar: { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: color.line },
  threadBarContent: { flexDirection: "row", gap: space.sm, padding: space.md, alignItems: "center" },
  messages: { padding: space.lg, gap: space.md, paddingBottom: space.xl },
  welcome: { alignItems: "center", paddingTop: space.xxl, paddingHorizontal: space.lg },
  suggestRow: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, justifyContent: "center" },
  bubbleRow: { flexDirection: "row", gap: space.sm, alignItems: "flex-end" },
  bubbleRowUser: { flexDirection: "row-reverse" },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: color.surfaceSunken,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarUser: { backgroundColor: color.cta },
  bubble: { maxWidth: "80%", padding: space.md, borderRadius: radius.lg },
  bubbleAssistant: {
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.line,
    borderBottomLeftRadius: 4,
  },
  bubbleUser: { backgroundColor: color.cta, borderBottomRightRadius: 4 },
  bubbleText: { ...text.body, color: color.ink },
  bubbleTextUser: { ...text.body, color: color.white, fontFamily: fontFamily.body },
  inputBar: {
    flexDirection: "row",
    gap: space.sm,
    alignItems: "center",
    padding: space.md,
    borderTopWidth: 1,
    borderTopColor: color.line,
    backgroundColor: color.bg,
  },
});
