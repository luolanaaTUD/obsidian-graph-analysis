import { App, Modal, TFile } from 'obsidian';
import { CentralityResult } from '../types/types';

export class ResultsModal extends Modal {
    results: CentralityResult[];
    algorithm: string;

    constructor(app: App, results: CentralityResult[], algorithm: string) {
        super(app);
        this.results = results;
        this.algorithm = algorithm;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h2', { text: `${this.algorithm} Analysis Results` });

        // Create a table for the results
        const table = contentEl.createEl('table');
        table.addClass('graph-analysis-results-table');
        
        // Add table header
        const thead = table.createEl('thead');
        const headerRow = thead.createEl('tr');
        headerRow.createEl('th', { text: 'Rank' });
        headerRow.createEl('th', { text: 'Note' });
        headerRow.createEl('th', { text: 'Score' });
        
        // Add table body
        const tbody = table.createEl('tbody');
        this.results.forEach((result, index) => {
            const row = tbody.createEl('tr');
            row.createEl('td', { text: `${index + 1}` });
            
            // Create a clickable link for the note
            const noteCell = row.createEl('td');
            const noteLink = noteCell.createEl('a', { 
                text: result.node_name,
                href: '#'
            });
            noteLink.addEventListener('click', (e) => {
                e.preventDefault();
                // Open the note when clicked
                const file = this.app.vault.getAbstractFileByPath(result.node_name);
                if (file instanceof TFile) {
                    this.app.workspace.getLeaf().openFile(file);
                    this.close();
                }
            });
            
            row.createEl('td', { text: result.score.toFixed(3) });
        });
        
        // Add a close button
        const buttonContainer = contentEl.createEl('div');
        buttonContainer.addClass('graph-analysis-button-container');
        const closeButton = buttonContainer.createEl('button', { text: 'Close' });
        closeButton.addEventListener('click', () => this.close());
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}