/**
 * SparkChart.tsx
 *
 * Lightweight inline sparkline for the live workout screen.
 * Renders a filled-area line chart using react-native-svg.
 * No axes, no labels — just the trend line.
 */

import React, {useMemo} from 'react';
import {View, StyleSheet} from 'react-native';
import Svg, {Polyline, Polygon, Defs, LinearGradient, Stop} from 'react-native-svg';

interface SparkChartProps {
  /** Array of numeric values to plot (e.g. heart rate or power readings). */
  data: number[];
  /** Stroke and fill tint color. */
  color: string;
  /** Height of the chart in logical pixels. Width fills the container. */
  height: number;
  /** Width override — normally omitted; measured from layout. */
  width?: number;
}

const PADDING = 4;

export function SparkChart({data, color, height, width: widthProp}: SparkChartProps) {
  const [containerWidth, setContainerWidth] = React.useState(widthProp ?? 0);

  const width = widthProp ?? containerWidth;

  const points = useMemo(() => {
    if (data.length < 2 || width === 0) {
      return null;
    }

    const minVal = Math.min(...data);
    const maxVal = Math.max(...data);
    const range = maxVal - minVal || 1; // avoid division by zero

    const chartW = width - PADDING * 2;
    const chartH = height - PADDING * 2;

    const pts = data.map((v, i) => {
      const x = PADDING + (i / (data.length - 1)) * chartW;
      const y = PADDING + (1 - (v - minVal) / range) * chartH;
      return {x, y};
    });

    // Build the polyline string
    const linePoints = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

    // Build the filled polygon (line + bottom corners to close shape)
    const last = pts[pts.length - 1];
    const first = pts[0];
    const fillPoints = [
      ...pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`),
      `${last.x.toFixed(1)},${(height - PADDING).toFixed(1)}`,
      `${first.x.toFixed(1)},${(height - PADDING).toFixed(1)}`,
    ].join(' ');

    return {linePoints, fillPoints};
  }, [data, width, height]);

  return (
    <View
      style={[styles.container, {height}]}
      onLayout={e => {
        if (!widthProp) {
          setContainerWidth(e.nativeEvent.layout.width);
        }
      }}
    >
      {points && width > 0 && (
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <Stop offset="100%" stopColor={color} stopOpacity={0.03} />
            </LinearGradient>
          </Defs>

          {/* Filled area under the line */}
          <Polygon points={points.fillPoints} fill="url(#sparkFill)" />

          {/* The line itself */}
          <Polyline
            points={points.linePoints}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </Svg>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    overflow: 'hidden',
  },
});
