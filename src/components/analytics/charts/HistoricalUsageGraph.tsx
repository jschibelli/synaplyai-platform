import React from 'react';
import { Line } from 'react-chartjs-2';
import { ChartData, ChartOptions } from 'chart.js';

interface HistoricalUsageGraphProps {
  data: {
    timestamp: string;
    totalTokens: number;
    modelId: string;
  }[];
  title: string;
}

export const HistoricalUsageGraph: React.FC<HistoricalUsageGraphProps> = ({ data, title }) => {
  // Group data by model
  const modelData = data.reduce((acc, item) => {
    if (!acc[item.modelId]) {
      acc[item.modelId] = [];
    }
    acc[item.modelId].push({
      x: new Date(item.timestamp),
      y: item.totalTokens
    });
    return acc;
  }, {} as Record<string, { x: Date; y: number }[]>);

  const chartData: ChartData = {
    datasets: Object.entries(modelData).map(([modelId, points], index) => ({
      label: modelId,
      data: points,
      borderColor: `hsl(${index * 137.5}, 70%, 50%)`,
      backgroundColor: `hsla(${index * 137.5}, 70%, 50%, 0.1)`,
      fill: true,
      tension: 0.4
    }))
  };

  const options: ChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        type: 'time',
        time: {
          unit: 'day',
          displayFormats: {
            day: 'MMM D'
          }
        },
        title: {
          display: true,
          text: 'Date'
        }
      },
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: 'Total Tokens'
        }
      }
    },
    plugins: {
      title: {
        display: true,
        text: title
      },
      tooltip: {
        mode: 'nearest',
        intersect: false,
        callbacks: {
          label: (context) => {
            const value = context.parsed.y;
            return `${context.dataset.label}: ${value.toLocaleString()} tokens`;
          }
        }
      }
    },
    interaction: {
      mode: 'nearest',
      axis: 'x',
      intersect: false
    }
  };

  return (
    <div className="historical-usage-graph">
      <Line data={chartData} options={options} height={300} />
    </div>
  );
};