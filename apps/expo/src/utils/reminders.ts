import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";

import { REMINDER_LEAD_MINUTES, timeFmt } from "@matops/domain";

import { pushEnabled } from "./push";

const MAP_KEY = "matops.classReminders";
const ANDROID_CHANNEL = "class-reminders";
const LEAD_MS = REMINDER_LEAD_MINUTES * 60 * 1000;

function readMap(): Record<string, string> {
  const raw = SecureStore.getItem(MAP_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}

function writeMap(map: Record<string, string>): Promise<void> {
  return SecureStore.setItemAsync(MAP_KEY, JSON.stringify(map));
}

// Every booking shares one stored map, and read-then-write is split by an await,
// so two quick taps could drop an entry and leave a cancelled class reminding.
// Updates run one at a time through this chain.
let writes: Promise<void> = Promise.resolve();

function updateMap(
  edit: (map: Record<string, string>) => Record<string, string>,
): Promise<void> {
  writes = writes.then(() => writeMap(edit(readMap())));
  return writes;
}

async function ensurePermission(): Promise<boolean> {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL, {
      name: "Class reminders",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) return true;
  if (!existing.canAskAgain) return false;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

export interface RemindableClass {
  id: string;
  title: string;
  startsAt: string | Date;
}

export async function scheduleClassReminder(c: RemindableClass): Promise<void> {
  if (!pushEnabled()) return;
  const start = new Date(c.startsAt);
  const fireAt = new Date(start.getTime() - LEAD_MS);
  if (fireAt.getTime() <= Date.now()) return;
  if (!(await ensurePermission())) return;

  await cancelClassReminder(c.id);
  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: c.title,
        body: `Starts at ${timeFmt.format(start)}.`,
        data: { type: "class", classId: c.id },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: fireAt,
        channelId: ANDROID_CHANNEL,
      },
    });
    await updateMap((map) => ({ ...map, [c.id]: id }));
  } catch (err) {
    console.warn("[reminders] could not schedule", err);
  }
}

export async function cancelClassReminder(classId: string): Promise<void> {
  let id: string | undefined;
  await updateMap((map) => {
    id = map[classId];
    if (id) delete map[classId];
    return map;
  });
  if (!id) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch (err) {
    console.warn("[reminders] could not cancel", err);
  }
}

export async function clearClassReminders(): Promise<void> {
  await SecureStore.deleteItemAsync(MAP_KEY);
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch (err) {
    console.warn("[reminders] could not clear", err);
  }
}
