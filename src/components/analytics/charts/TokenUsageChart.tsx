import React from 'react';
import { Bar } from 'react-chartjs-2';
import { ChartData, ChartOptions } from 'chart.js';

interface TokenUsageChartProps {
  data: {
    modelId: string;
    promptTokens: number;
    completionTokens: number;
  }[];
  title: string;
}

export const TokenUsageChart: React.FC<TokenUsageChartProps> = ({ data, title }) => {
  const chartData: ChartData = {
    labels: data.map(item => item.modelId),
    datasets: [
      {
        label: 'Prompt Tokens',
        data: data.map(item => item.promptTokens),
        backgroundColor: 'rgba(54, 162, 235, 0.5)',
      },
      {
        label: 'Completion Tokens',
        data: data.map(item => item.completionTokens),
        backgroundColor: 'rgba(75, 192, 192, 0.5)',
      }
    ]
  };

  const options: ChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: 'Token Count'
        }
      }
    },
    plugins: {
      title: {
        display: true,
        text: title
      },
      tooltip: {
        mode: 'index',
        intersect: false,
      }
    }
  };

  return (
    <div className="token-usage-chart">
      <Bar data={chartData} options={options} height={300} />
    </div>
  );
};