import React from 'react';
import { Line } from 'react-chartjs-2';

interface LatencyChartProps {
    latencyData: { timestamp: string; latency: number }[];
}

const LatencyChart: React.FC<LatencyChartProps> = ({ latencyData }) => {
    const data = {
        labels: latencyData.map(dataPoint => dataPoint.timestamp),
        datasets: [
            {
                label: 'Filter Latency',
                data: latencyData.map(dataPoint => dataPoint.latency),
                fill: false,
                backgroundColor: 'rgba(75,192,192,0.4)',
                borderColor: 'rgba(75,192,192,1)',
            },
        ],
    };

    const options = {
        scales: {
            x: {
                type: 'time',
                time: {
                    unit: 'minute',
                },
            },
            y: {
                beginAtZero: true,
            },
        },
    };

    return <Line data={data} options={options} />;
};

export default LatencyChart;