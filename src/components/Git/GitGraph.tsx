import React, { useMemo } from 'react';
import type { GitCommitLog } from 'restar-app-git';

interface GitGraphProps {
  history: GitCommitLog[];
  height?: number;
  dotSize?: number;
  lineWidth?: number;
  spacing?: number;
}

interface GraphNode {
  hash: string;
  x: number;
  y: number;
  color: string;
  parents: string[];
}

interface GraphLink {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
}

const COLORS = [
  '#4ec9b0', // cyan
  '#ce9178', // orange
  '#569cd6', // blue
  '#c586c0', // purple
  '#6a9955', // green
  '#f44747', // red
];

export const GitGraph: React.FC<GitGraphProps> = ({
  history,
  height = 36,
  dotSize = 5,
  lineWidth = 2,
  spacing = 14,
}) => {
  const { nodes, links, width } = useMemo(() => {
    const calculatedNodes: GraphNode[] = [];
    const calculatedLinks: GraphLink[] = [];
    const activeColumns: { hash: string; color: string }[] = [];
    let maxColumn = 0;

    const getColumn = (hash: string) => {
      return activeColumns.findIndex((c) => c.hash === hash);
    };

    const assignColumn = (hash: string, color?: string) => {
      let col = getColumn(hash);
      if (col !== -1) return col;

      col = activeColumns.findIndex((c) => c.hash === '');
      const assignedColor = color || COLORS[activeColumns.length % COLORS.length];

      if (col !== -1) {
        activeColumns[col] = { hash, color: assignedColor };
      } else {
        col = activeColumns.length;
        activeColumns.push({ hash, color: assignedColor });
      }

      if (col > maxColumn) maxColumn = col;
      return col;
    };

    history.forEach((commit, rowIndex) => {
      const col = assignColumn(commit.hash);
      const color = activeColumns[col].color;

      calculatedNodes.push({
        hash: commit.hash,
        x: col,
        y: rowIndex,
        color,
        parents: commit.parents,
      });

      activeColumns[col].hash = '';

      if (commit.parents && commit.parents.length > 0) {
        commit.parents.forEach((parentHash, pIdx) => {
          let pCol = getColumn(parentHash);
          let linkColor = color;

          if (pCol === -1) {
            pCol = assignColumn(parentHash, pIdx === 0 ? color : undefined);
            linkColor = activeColumns[pCol].color;
          }

          calculatedLinks.push({
            x1: col,
            y1: rowIndex,
            x2: pCol,
            y2: rowIndex + 1,
            color: linkColor,
          });
        });
      }
    });

    const totalWidth = Math.max((maxColumn + 1) * spacing + 10, 24);
    return { nodes: calculatedNodes, links: calculatedLinks, width: totalWidth };
  }, [history, spacing]);

  if (history.length === 0) return null;

  return (
    <svg
      className="git-graph-svg"
      style={{
        width: `${width}px`,
        height: `${history.length * height}px`,
      }}
    >
      {/* リンク線 */}
      {links.map((link, i) => {
        const startX = link.x1 * spacing + spacing / 2;
        const startY = link.y1 * height + height / 2;
        const endX = link.x2 * spacing + spacing / 2;
        const endY = link.y2 * height + height / 2;

        return (
          <path
            key={`link-${i}`}
            d={
              link.x1 === link.x2
                ? `M ${startX} ${startY} L ${endX} ${endY}`
                : `M ${startX} ${startY} C ${startX} ${startY + height / 2}, ${endX} ${endY - height / 2}, ${endX} ${endY}`
            }
            stroke={link.color}
            strokeWidth={lineWidth}
            fill="none"
          />
        );
      })}

      {/* コミットドット */}
      {nodes.map((node, i) => {
        const cx = node.x * spacing + spacing / 2;
        const cy = node.y * height + height / 2;

        return (
          <circle
            key={`node-${i}`}
            cx={cx}
            cy={cy}
            r={dotSize}
            fill={node.color}
            stroke="var(--bg-secondary, #252526)"
            strokeWidth={1.5}
          />
        );
      })}
    </svg>
  );
};
