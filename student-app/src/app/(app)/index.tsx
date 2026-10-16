import { Linking, Platform, StyleSheet, View } from 'react-native'

import { formatDay, formatTime, todayInMalaysia } from '@/lib/format'
import type { UpcomingClass } from '@/lib/portal'
import { useSession } from '@/lib/session'
import { Body, Button, Card, colors, Empty, Heading, Loading, Muted, Pill, Screen, Title } from '@/ui/kit'

// Home: the next class with its Zoom button, the classes after it, and the
// points so far (each part only when the school shows it to this login).
export default function Home() {
  const { home, homeError, child, children, branding, isRefreshing, refresh } = useSession()

  if (!home) {
    return (
      <Screen>
        {homeError ? <Empty>{homeError}</Empty> : <Loading />}
      </Screen>
    )
  }

  const schedule = home.schedule ?? []
  const [next, ...later] = schedule
  const today = todayInMalaysia()

  return (
    <Screen refreshing={isRefreshing} onRefresh={() => void refresh()}>
      <View style={{ gap: 4 }}>
        <Muted>{branding.schoolName || 'Welcome'}</Muted>
        <Title>Hi, {(child?.name ?? home.student.name).split(/\s+/)[0]}!</Title>
        {home.student.class && <Muted>{home.student.class}</Muted>}
        {home.viewer === 'parent' && children.length > 1 && <Muted>Switch child on the Me tab.</Muted>}
      </View>

      {home.sees.schedule && (
        <Card>
          <Heading>Next class</Heading>
          {next ? (
            <NextClass item={next} isToday={next.date === today} color={branding.accentColor} />
          ) : (
            <Empty>No classes in the next three weeks.</Empty>
          )}
        </Card>
      )}

      {home.sees.schedule && later.length > 0 && (
        <Card>
          <Heading>Coming up</Heading>
          {later.slice(0, 8).map((item) => (
            <View key={`${item.date}-${item.start}-${item.title}`} style={styles.row}>
              <Body style={{ fontWeight: '600' }}>{formatDay(item.date)}</Body>
              <Muted>
                {formatTime(item.start)} · {item.class ?? item.title}
              </Muted>
            </View>
          ))}
        </Card>
      )}

      {home.points && (
        <Card>
          <Heading>My points</Heading>
          <View style={styles.pointsRow}>
            <Title style={{ color: branding.accentColor }}>⭐ {home.points.total}</Title>
            {home.points.level && <Pill color={colors.warn} background={colors.warnBg}>{home.points.level}</Pill>}
          </View>
          {home.points.next_level && (
            <>
              <View style={styles.track}>
                <View
                  style={[
                    styles.fill,
                    {
                      backgroundColor: branding.accentColor,
                      width: `${Math.min(
                        100,
                        Math.max(
                          0,
                          ((home.points.total - home.points.level_start) /
                            Math.max(1, home.points.next_level.min_points - home.points.level_start)) *
                            100,
                        ),
                      )}%`,
                    },
                  ]}
                />
              </View>
              <Muted>
                {home.points.next_level.min_points - home.points.total} more to reach {home.points.next_level.name}
              </Muted>
            </>
          )}
          {home.points.recent.slice(0, 5).map((entry, index) => (
            <View key={index} style={styles.pointRow}>
              <Body style={{ flex: 1 }}>{entry.reason}</Body>
              <Body style={{ fontWeight: '700', color: entry.points > 0 ? colors.good : colors.bad }}>
                {entry.points > 0 ? '+' : ''}
                {entry.points}
              </Body>
            </View>
          ))}
        </Card>
      )}
    </Screen>
  )
}

function NextClass({ item, isToday, color }: { item: UpcomingClass; isToday: boolean; color: string }) {
  function join() {
    if (!item.zoom_link) return
    if (Platform.OS === 'web') {
      window.open(item.zoom_link, '_blank', 'noopener')
    } else {
      void Linking.openURL(item.zoom_link)
    }
  }

  return (
    <View style={{ gap: 6 }}>
      {isToday && <Pill color={colors.good} background={colors.goodBg}>Today</Pill>}
      <Body style={{ fontSize: 18, fontWeight: '700' }}>
        {formatDay(item.date)}, {formatTime(item.start)} – {formatTime(item.end)}
      </Body>
      <Muted>
        {item.class ?? item.title}
        {item.teacher ? ` · ${item.teacher}` : ''}
      </Muted>
      {item.zoom_link ? (
        <Button label="Join class on Zoom" color={color} onPress={join} />
      ) : (
        <Muted>The class link will appear here.</Muted>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.border, gap: 2 },
  pointsRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  track: { height: 10, borderRadius: 999, backgroundColor: colors.border, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 999 },
  pointRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 6, borderTopWidth: 1, borderTopColor: colors.border },
})
