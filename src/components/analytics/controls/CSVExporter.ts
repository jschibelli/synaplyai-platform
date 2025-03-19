/**
 * Utility for exporting data to CSV format
 */
export class CSVExporter {
  /**
   * Export data to CSV file and trigger download
   */
  static exportToCSV(data: any, filename: string): void {
    if (!data) return;

    // Process summary data
    let csvContent = "Summary Data\n";
    if (data.summary) {
      for (const [key, value] of Object.entries(data.summary)) {
        csvContent += `${key},${value}\n`;
      }
    }

    csvContent += "\nModel Breakdown\n";
    csvContent += "Model,Prompt Tokens,Completion Tokens,Total Tokens\n";
    
    // Process model breakdown
    if (data.modelBreakdown && Array.isArray(data.modelBreakdown)) {
      data.modelBreakdown.forEach((model: any) => {
        csvContent += `${model.modelId},${model.promptTokens},${model.completionTokens},${model.promptTokens + model.completionTokens}\n`;
      });
    }

    // Process historical data
    csvContent += "\nHistorical Usage\n";
    csvContent += "Date,Model,Total Tokens\n";
    
    if (data.historicalUsage && Array.isArray(data.historicalUsage)) {
      data.historicalUsage.forEach((item: any) => {
        csvContent += `${item.timestamp},${item.modelId},${item.totalTokens}\n`;
      });
    }

    // Encode CSV content
    const encodedUri = encodeURI("data:text/csv;charset=utf-8," + csvContent);
    
    // Create link and trigger download
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${filename}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}