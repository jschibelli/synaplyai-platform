import React from 'react';
import { render, screen } from '@testing-library/react';
import { ProgressBar } from '../../../src/components/common/ProgressBar';

describe('ProgressBar', () => {
  test('renders with default props', () => {
    render(<ProgressBar percentage={50} />);
    
    const progressBar = screen.getByRole('progressbar');
    expect(progressBar).toBeInTheDocument();
    expect(progressBar).toHaveAttribute('aria-valuenow', '50');
  });

  test('respects percentage constraints', () => {
    // Test percentage > 100
    render(<ProgressBar percentage={150} data-testid="over" />);
    expect(screen.getByTestId('over')).toHaveAttribute('aria-valuenow', '100');
    
    // Test percentage < 0
    render(<ProgressBar percentage={-20} data-testid="under" />);
    expect(screen.getByTestId('under')).toHaveAttribute('aria-valuenow', '0');
  });

  test('applies different themes correctly', () => {
    const { rerender } = render(<ProgressBar percentage={50} theme="success" />);
    expect(screen.getByRole('progressbar').firstChild).toHaveClass('bg-green-500');
    
    rerender(<ProgressBar percentage={50} theme="warning" />);
    expect(screen.getByRole('progressbar').firstChild).toHaveClass('bg-yellow-500');
    
    rerender(<ProgressBar percentage={50} theme="danger" />);
    expect(screen.getByRole('progressbar').firstChild).toHaveClass('bg-red-500');
    
    rerender(<ProgressBar percentage={50} theme="primary" />);
    expect(screen.getByRole('progressbar').firstChild).toHaveClass('bg-blue-500');
  });

  test('shows percentage when showPercentage is true', () => {
    render(<ProgressBar percentage={75} showPercentage />);
    expect(screen.getByText('75%')).toBeInTheDocument();
  });

  test('displays label when provided', () => {
    render(<ProgressBar percentage={60} label="Usage" />);
    expect(screen.getByText('Usage')).toBeInTheDocument();
  });

  test('combines label and percentage display', () => {
    render(<ProgressBar percentage={30} label="Storage" showPercentage />);
    expect(screen.getByText('Storage')).toBeInTheDocument();
    expect(screen.getByText('30%')).toBeInTheDocument();
  });

  test('allows custom height', () => {
    render(<ProgressBar percentage={40} height={16} />);
    expect(screen.getByRole('progressbar')).toHaveStyle({ height: '16px' });
  });

  test('applies custom className', () => {
    render(<ProgressBar percentage={40} className="custom-class" />);
    expect(screen.getByRole('progressbar').parentElement).toHaveClass('custom-class');
  });

  test('has proper accessibility attributes', () => {
    render(<ProgressBar percentage={40} ariaLabel="Test progress" />);
    const progressBar = screen.getByRole('progressbar');
    expect(progressBar).toHaveAttribute('aria-valuemin', '0');
    expect(progressBar).toHaveAttribute('aria-valuemax', '100');
    expect(progressBar).toHaveAttribute('aria-valuenow', '40');
    expect(progressBar).toHaveAttribute('aria-label', 'Test progress');
  });
});