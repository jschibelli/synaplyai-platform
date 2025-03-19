import React from 'react';
import { render, screen } from '@testing-library/react';
import { RateLimitIndicator } from '../../../src/components/metrics/RateLimitIndicator';

describe('RateLimitIndicator', () => {
  const defaultProps = {
    remaining: 75,
    total: 100,
    resetAt: new Date().toISOString(),
  };

  it('renders without crashing', () => {
    render(<RateLimitIndicator {...defaultProps} />);
    expect(screen.getByText('Rate Limit Status')).toBeInTheDocument();
  });

  it('shows correct remaining and total values', () => {
    render(<RateLimitIndicator {...defaultProps} />);
    expect(screen.getByText('75')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
  });

  it('displays warning state when remaining is low', () => {
    render(
      <RateLimitIndicator
        {...defaultProps}
        remaining={15}
        total={100}
      />
    );
    const progressBar = screen.getByRole('progressbar');
    expect(progressBar).toHaveClass('bg-yellow-500');
  });

  it('shows error message when rate limit is exceeded', () => {
    render(
      <RateLimitIndicator
        {...defaultProps}
        remaining={0}
        total={100}
      />
    );
    expect(screen.getByText('Rate limit exceeded')).toBeInTheDocument();
  });

  it('displays reset time correctly', () => {
    const testDate = new Date();
    render(
      <RateLimitIndicator
        {...defaultProps}
        resetAt={testDate.toISOString()}
      />
    );
    expect(screen.getByText(`Resets at ${testDate.toLocaleTimeString()}`)).toBeInTheDocument();
  });
});