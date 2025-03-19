import React from 'react';
import { render, screen } from '@testing-library/react';
import { ThresholdWarning } from '../../../src/components/metrics/ThresholdWarning';

// Mock framer-motion to avoid animation testing complexity
jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>
  },
  AnimatePresence: ({ children }: any) => <>{children}</>
}));

describe('ThresholdWarning', () => {
  const defaultProps = {
    warning: 70,
    critical: 90,
    current: 50
  };

  test('renders normal state correctly', () => {
    render(<ThresholdWarning {...defaultProps} />);
    
    // Check basic elements
    expect(screen.getByText('Resource Usage')).toBeInTheDocument();
    expect(screen.getByText('normal')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
    
    // Check thresholds
    expect(screen.getByText('70%')).toBeInTheDocument();
    expect(screen.getByText('90%')).toBeInTheDocument();
    
    // Should not show warning message
    expect(screen.queryByText(/threshold reached/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/action required/i)).not.toBeInTheDocument();
  });

  test('renders warning state correctly', () => {
    render(
      <ThresholdWarning
        {...defaultProps}
        current={75}
      />
    );

    expect(screen.getByText('warning')).toBeInTheDocument();
    expect(screen.getByText('75%')).toBeInTheDocument();
    expect(screen.getByText('Warning threshold reached. Please monitor usage.')).toBeInTheDocument();

    // Check correct color classes
    const container = screen.getByText('warning').parentElement;
    expect(container).toHaveClass('bg-yellow-100');
    expect(container).toHaveClass('text-yellow-700');
  });

  test('renders critical state correctly', () => {
    render(
      <ThresholdWarning
        {...defaultProps}
        current={95}
      />
    );

    expect(screen.getByText('critical')).toBeInTheDocument();
    expect(screen.getByText('95%')).toBeInTheDocument();
    expect(screen.getByText('Critical threshold exceeded! Action required.')).toBeInTheDocument();

    // Check correct color classes
    const container = screen.getByText('critical').parentElement;
    expect(container).toHaveClass('bg-red-100');
    expect(container).toHaveClass('text-red-700');
  });

  test('applies custom className', () => {
    render(
      <ThresholdWarning
        {...defaultProps}
        className="custom-class"
      />
    );

    const container = screen.getByText('Resource Usage').closest('.threshold-warning');
    expect(container).toHaveClass('custom-class');
  });

  test('handles edge cases for thresholds', () => {
    // Test exactly at warning threshold
    render(
      <ThresholdWarning
        {...defaultProps}
        current={70}
      />
    );
    expect(screen.getByText('warning')).toBeInTheDocument();

    // Cleanup
    cleanup();

    // Test exactly at critical threshold
    render(
      <ThresholdWarning
        {...defaultProps}
        current={90}
      />
    );
    expect(screen.getByText('critical')).toBeInTheDocument();
  });

  test('renders progress bar with correct width', () => {
    render(
      <ThresholdWarning
        {...defaultProps}
        current={60}
      />
    );

    const progressBar = screen.getByText('').closest('.shadow-none');
    expect(progressBar).toHaveStyle({ width: '60%' });
  });

  test('handles invalid threshold values', () => {
    render(
      <ThresholdWarning
        {...defaultProps}
        warning={120} // Invalid warning threshold > 100
        critical={150} // Invalid critical threshold > 100
        current={50}
      />
    );

    // Should clamp values to 100
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  test('handles negative current values', () => {
    render(
      <ThresholdWarning
        {...defaultProps}
        current={-10}
      />
    );

    // Should clamp to 0
    expect(screen.getByText('0%')).toBeInTheDocument();
    expect(screen.getByText('normal')).toBeInTheDocument();
  });

  test('handles threshold transitions with animations', () => {
    const { rerender } = render(
      <ThresholdWarning {...defaultProps} current={50} />
    );

    // Initial state
    expect(screen.getByText('normal')).toBeInTheDocument();
    
    // Transition to warning state
    rerender(
      <ThresholdWarning {...defaultProps} current={75} />
    );
    
    // Check animation props
    const progressBar = screen.getByText('').closest('.shadow-none');
    expect(progressBar).toHaveAttribute('style', expect.stringContaining('width: 75%'));
    expect(progressBar).toHaveAttribute('style', expect.stringContaining('transition'));
  });

  test('displays correct warning message based on proximity to critical', () => {
    render(
      <ThresholdWarning
        {...defaultProps}
        warning={70}
        critical={90}
        current={85} // Close to critical
      />
    );

    expect(screen.getByText(/threshold reached/i)).toHaveTextContent(
      expect.stringMatching(/approaching critical/i)
    );
  });

  test('handles rapid threshold updates', () => {
    const { rerender } = render(
      <ThresholdWarning {...defaultProps} current={50} />
    );

    // Rapidly update values
    for (let i = 50; i <= 95; i += 5) {
      rerender(
        <ThresholdWarning {...defaultProps} current={i} />
      );
      
      // Verify correct percentage is always displayed
      expect(screen.getByText(`${i}%`)).toBeInTheDocument();
    }
  });

  test('maintains accessibility attributes', () => {
    render(<ThresholdWarning {...defaultProps} current={75} />);

    const progressBar = screen.getByText('').closest('.shadow-none');
    expect(progressBar).toHaveAttribute('role', 'progressbar');
    expect(progressBar).toHaveAttribute('aria-valuenow', '75');
    expect(progressBar).toHaveAttribute('aria-valuemin', '0');
    expect(progressBar).toHaveAttribute('aria-valuemax', '100');
  });

  describe('accessibility features', () => {
    test('provides ARIA live region for status changes', () => {
      const { rerender } = render(<ThresholdWarning {...defaultProps} />);

      const statusRegion = screen.getByRole('status');
      expect(statusRegion).toHaveAttribute('aria-live', 'polite');

      // Transition to warning state
      rerender(<ThresholdWarning {...defaultProps} current={75} />);
      expect(statusRegion).toHaveTextContent(/warning threshold reached/i);
    });

    test('ensures color is not the only means of conveying status', () => {
      render(<ThresholdWarning {...defaultProps} current={95} />);

      const status = screen.getByText('critical');
      expect(status).toHaveAttribute('aria-label', 'Critical status');
      expect(status).toHaveAccessibleName();
    });

    test('maintains sufficient color contrast ratios', () => {
      render(<ThresholdWarning {...defaultProps} current={75} />);

      const warningText = screen.getByText('warning');
      const styles = window.getComputedStyle(warningText);
      
      // Verify text color has sufficient contrast with background
      expect(styles.color).toBe('rgb(120, 53, 15)'); // text-yellow-700
      expect(styles.backgroundColor).toBe('rgb(254, 243, 199)'); // bg-yellow-100
    });
  });

  describe('edge cases and error handling', () => {
    test('handles undefined props gracefully', () => {
      // @ts-ignore - Testing invalid props
      render(<ThresholdWarning />);
      
      expect(screen.getByText('0%')).toBeInTheDocument();
      expect(screen.getByText('normal')).toBeInTheDocument();
    });

    test('handles decimal values correctly', () => {
      render(
        <ThresholdWarning
          {...defaultProps}
          current={75.5}
          warning={70.3}
          critical={90.7}
        />
      );

      expect(screen.getByText('76%')).toBeInTheDocument(); // Should round to nearest integer
    });

    test('handles rapid consecutive updates without visual glitches', () => {
      const { rerender } = render(<ThresholdWarning {...defaultProps} />);

      // Simulate rapid updates
      for (let i = 0; i < 10; i++) {
        rerender(
          <ThresholdWarning
            {...defaultProps}
            current={50 + Math.random() * 50}
          />
        );
      }

      // Animation should still be smooth
      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toHaveAttribute('style', expect.stringContaining('transition'));
    });

    test('handles threshold inversions', () => {
      render(
        <ThresholdWarning
          {...defaultProps}
          warning={90} // Warning threshold higher than critical
          critical={70}
          current={80}
        />
      );

      // Should use the lower value as warning
      expect(screen.getByText(/threshold reached/i)).toBeInTheDocument();
    });
  });

  describe('performance optimizations', () => {
    test('maintains smooth animations under load', () => {
      const { rerender } = render(<ThresholdWarning {...defaultProps} />);

      // Simulate high-frequency updates
      const startTime = performance.now();
      
      for (let i = 0; i < 100; i++) {
        rerender(
          <ThresholdWarning
            {...defaultProps}
            current={i}
          />
        );
      }

      const duration = performance.now() - startTime;
      expect(duration).toBeLessThan(1000); // Should complete in under 1 second
    });
  });
});