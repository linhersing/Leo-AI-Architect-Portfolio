using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;

namespace CraneTranscript
{
    internal static class Program
    {
        [STAThread]
        private static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new MainForm());
        }
    }

    internal sealed class MainForm : Form
    {
        private const int SegmentSeconds = 1800;
        private readonly string appRoot = AppDomain.CurrentDomain.BaseDirectory;
        private readonly BackgroundWorker worker = new BackgroundWorker();
        private readonly object processLock = new object();

        private TextBox filePathBox;
        private ComboBox languageBox;
        private CheckBox srtCheckBox;
        private Button chooseButton;
        private Button startButton;
        private Button cancelButton;
        private Button outputButton;
        private Button copyButton;
        private ProgressBar progressBar;
        private Label statusLabel;
        private Label detailLabel;
        private RichTextBox transcriptBox;
        private Process currentProcess;
        private string lastOutputFile;
        private string diagnosticLog = string.Empty;

        public MainForm()
        {
            Text = "鶴昇逐字稿";
            Width = 900;
            Height = 690;
            MinimumSize = new Size(780, 620);
            StartPosition = FormStartPosition.CenterScreen;
            BackColor = Color.FromArgb(246, 247, 249);
            Font = new Font("Microsoft JhengHei UI", 10F, FontStyle.Regular, GraphicsUnit.Point);
            AllowDrop = true;

            BuildInterface();

            worker.WorkerReportsProgress = true;
            worker.WorkerSupportsCancellation = true;
            worker.DoWork += Worker_DoWork;
            worker.ProgressChanged += Worker_ProgressChanged;
            worker.RunWorkerCompleted += Worker_RunWorkerCompleted;

            DragEnter += MainForm_DragEnter;
            DragDrop += MainForm_DragDrop;
            FormClosing += MainForm_FormClosing;
        }

        private void BuildInterface()
        {
            Panel header = new Panel();
            header.Dock = DockStyle.Top;
            header.Height = 92;
            header.BackColor = Color.FromArgb(25, 35, 46);

            Label title = new Label();
            title.Text = "鶴昇逐字稿";
            title.ForeColor = Color.White;
            title.Font = new Font("Microsoft JhengHei UI", 22F, FontStyle.Bold);
            title.AutoSize = true;
            title.Location = new Point(28, 16);

            Label subtitle = new Label();
            subtitle.Text = "本機辨識，不需 API Key｜支援兩小時以上影音檔";
            subtitle.ForeColor = Color.FromArgb(196, 205, 214);
            subtitle.Font = new Font("Microsoft JhengHei UI", 10F);
            subtitle.AutoSize = true;
            subtitle.Location = new Point(31, 58);

            header.Controls.Add(title);
            header.Controls.Add(subtitle);
            Controls.Add(header);

            Panel content = new Panel();
            content.Dock = DockStyle.Fill;
            content.Padding = new Padding(28, 22, 28, 22);
            content.AutoScroll = true;

            TableLayoutPanel layout = new TableLayoutPanel();
            layout.Dock = DockStyle.Fill;
            layout.ColumnCount = 1;
            layout.RowCount = 8;
            layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F));
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 25F));
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 48F));
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 72F));
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 50F));
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 65F));
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 30F));
            layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100F));
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 48F));

            Label fileLabel = MakeLabel("影音檔案");
            layout.Controls.Add(fileLabel, 0, 0);

            TableLayoutPanel fileRow = new TableLayoutPanel();
            fileRow.Dock = DockStyle.Fill;
            fileRow.ColumnCount = 2;
            fileRow.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F));
            fileRow.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 118F));

            filePathBox = new TextBox();
            filePathBox.Dock = DockStyle.Fill;
            filePathBox.ReadOnly = true;
            filePathBox.BackColor = Color.White;
            filePathBox.Margin = new Padding(0, 4, 10, 8);
            filePathBox.Font = new Font("Microsoft JhengHei UI", 10F);

            chooseButton = MakeButton("選擇檔案", Color.FromArgb(49, 99, 149), Color.White);
            chooseButton.Margin = new Padding(0, 3, 0, 7);
            chooseButton.Click += ChooseButton_Click;

            fileRow.Controls.Add(filePathBox, 0, 0);
            fileRow.Controls.Add(chooseButton, 1, 0);
            layout.Controls.Add(fileRow, 0, 1);

            TableLayoutPanel options = new TableLayoutPanel();
            options.Dock = DockStyle.Fill;
            options.ColumnCount = 2;
            options.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50F));
            options.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50F));

            Panel languagePanel = new Panel();
            languagePanel.Dock = DockStyle.Fill;
            Label languageLabel = MakeLabel("辨識語言");
            languageLabel.Location = new Point(0, 0);
            languageBox = new ComboBox();
            languageBox.DropDownStyle = ComboBoxStyle.DropDownList;
            languageBox.Items.AddRange(new object[] { "自動偵測", "中文", "English" });
            languageBox.SelectedIndex = 0;
            languageBox.Location = new Point(0, 29);
            languageBox.Width = 205;
            languagePanel.Controls.Add(languageLabel);
            languagePanel.Controls.Add(languageBox);

            Panel outputOptionPanel = new Panel();
            outputOptionPanel.Dock = DockStyle.Fill;
            Label outputLabel = MakeLabel("輸出格式");
            outputLabel.Location = new Point(10, 0);
            srtCheckBox = new CheckBox();
            srtCheckBox.Text = "TXT 逐字稿 + SRT 字幕";
            srtCheckBox.Checked = true;
            srtCheckBox.AutoSize = true;
            srtCheckBox.Location = new Point(10, 31);
            outputOptionPanel.Controls.Add(outputLabel);
            outputOptionPanel.Controls.Add(srtCheckBox);

            options.Controls.Add(languagePanel, 0, 0);
            options.Controls.Add(outputOptionPanel, 1, 0);
            layout.Controls.Add(options, 0, 2);

            TableLayoutPanel actions = new TableLayoutPanel();
            actions.Dock = DockStyle.Fill;
            actions.ColumnCount = 4;
            actions.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 160F));
            actions.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 105F));
            actions.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 155F));
            actions.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F));

            startButton = MakeButton("開始轉逐字稿", Color.FromArgb(27, 126, 89), Color.White);
            startButton.Margin = new Padding(0, 3, 10, 5);
            startButton.Click += StartButton_Click;

            cancelButton = MakeButton("取消", Color.FromArgb(224, 228, 232), Color.FromArgb(48, 56, 64));
            cancelButton.Margin = new Padding(0, 3, 10, 5);
            cancelButton.Enabled = false;
            cancelButton.Click += CancelButton_Click;

            outputButton = MakeButton("開啟輸出資料夾", Color.FromArgb(224, 228, 232), Color.FromArgb(48, 56, 64));
            outputButton.Margin = new Padding(0, 3, 10, 5);
            outputButton.Click += OutputButton_Click;

            actions.Controls.Add(startButton, 0, 0);
            actions.Controls.Add(cancelButton, 1, 0);
            actions.Controls.Add(outputButton, 2, 0);
            layout.Controls.Add(actions, 0, 3);

            Panel statusPanel = new Panel();
            statusPanel.Dock = DockStyle.Fill;
            progressBar = new ProgressBar();
            progressBar.Dock = DockStyle.Top;
            progressBar.Height = 16;
            statusLabel = new Label();
            statusLabel.Text = "請選擇或拖曳影音檔案";
            statusLabel.AutoSize = true;
            statusLabel.Font = new Font("Microsoft JhengHei UI", 10F, FontStyle.Bold);
            statusLabel.Location = new Point(0, 25);
            detailLabel = new Label();
            detailLabel.Text = "檔案不需上傳，辨識全程在這台電腦完成。";
            detailLabel.AutoSize = true;
            detailLabel.ForeColor = Color.FromArgb(92, 101, 111);
            detailLabel.Location = new Point(0, 46);
            statusPanel.Controls.Add(progressBar);
            statusPanel.Controls.Add(statusLabel);
            statusPanel.Controls.Add(detailLabel);
            layout.Controls.Add(statusPanel, 0, 4);

            Label previewLabel = MakeLabel("逐字稿預覽");
            layout.Controls.Add(previewLabel, 0, 5);

            transcriptBox = new RichTextBox();
            transcriptBox.Dock = DockStyle.Fill;
            transcriptBox.ReadOnly = true;
            transcriptBox.BackColor = Color.White;
            transcriptBox.BorderStyle = BorderStyle.FixedSingle;
            transcriptBox.Font = new Font("Microsoft JhengHei UI", 11F);
            transcriptBox.Text = "完成後，逐字稿會顯示在這裡。";
            layout.Controls.Add(transcriptBox, 0, 6);

            TableLayoutPanel footer = new TableLayoutPanel();
            footer.Dock = DockStyle.Fill;
            footer.ColumnCount = 2;
            footer.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F));
            footer.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 125F));
            Label supported = new Label();
            supported.Text = "支援 MP3、M4A、WAV、AAC、FLAC、MP4、MOV、MKV、AVI、WMV、WEBM 等常見格式";
            supported.AutoSize = false;
            supported.Dock = DockStyle.Fill;
            supported.TextAlign = ContentAlignment.MiddleLeft;
            supported.ForeColor = Color.FromArgb(92, 101, 111);
            supported.Font = new Font("Microsoft JhengHei UI", 9F);
            copyButton = MakeButton("複製逐字稿", Color.FromArgb(224, 228, 232), Color.FromArgb(48, 56, 64));
            copyButton.Margin = new Padding(8, 6, 0, 5);
            copyButton.Enabled = false;
            copyButton.Click += CopyButton_Click;
            footer.Controls.Add(supported, 0, 0);
            footer.Controls.Add(copyButton, 1, 0);
            layout.Controls.Add(footer, 0, 7);

            content.Controls.Add(layout);
            Controls.Add(content);
            content.BringToFront();
        }

        private static Label MakeLabel(string text)
        {
            Label label = new Label();
            label.Text = text;
            label.AutoSize = true;
            label.Font = new Font("Microsoft JhengHei UI", 10F, FontStyle.Bold);
            return label;
        }

        private static Button MakeButton(string text, Color background, Color foreground)
        {
            Button button = new Button();
            button.Text = text;
            button.Dock = DockStyle.Fill;
            button.FlatStyle = FlatStyle.Flat;
            button.FlatAppearance.BorderSize = 0;
            button.BackColor = background;
            button.ForeColor = foreground;
            button.Font = new Font("Microsoft JhengHei UI", 10F, FontStyle.Bold);
            button.Cursor = Cursors.Hand;
            return button;
        }

        private void ChooseButton_Click(object sender, EventArgs e)
        {
            using (OpenFileDialog dialog = new OpenFileDialog())
            {
                dialog.Title = "選擇要轉成逐字稿的影音檔";
                dialog.Filter = "影音檔案|*.mp3;*.m4a;*.wav;*.aac;*.flac;*.ogg;*.wma;*.mp4;*.mov;*.mkv;*.avi;*.wmv;*.webm;*.mpeg;*.mpg;*.m4v;*.3gp;*.ts;*.mts|所有檔案|*.*";
                dialog.CheckFileExists = true;
                dialog.Multiselect = false;
                if (dialog.ShowDialog(this) == DialogResult.OK)
                {
                    SetSelectedFile(dialog.FileName);
                }
            }
        }

        private void MainForm_DragEnter(object sender, DragEventArgs e)
        {
            if (e.Data.GetDataPresent(DataFormats.FileDrop))
            {
                e.Effect = DragDropEffects.Copy;
            }
        }

        private void MainForm_DragDrop(object sender, DragEventArgs e)
        {
            string[] files = e.Data.GetData(DataFormats.FileDrop) as string[];
            if (files != null && files.Length > 0 && File.Exists(files[0]))
            {
                SetSelectedFile(files[0]);
            }
        }

        private void SetSelectedFile(string path)
        {
            filePathBox.Text = path;
            statusLabel.Text = "檔案已選擇，可以開始辨識";
            detailLabel.Text = new FileInfo(path).Length >= 1024 * 1024
                ? "檔案大小：" + (new FileInfo(path).Length / 1024d / 1024d).ToString("0.0") + " MB"
                : "檔案大小：" + (new FileInfo(path).Length / 1024d).ToString("0.0") + " KB";
            transcriptBox.Text = "完成後，逐字稿會顯示在這裡。";
            copyButton.Enabled = false;
        }

        private void StartButton_Click(object sender, EventArgs e)
        {
            if (worker.IsBusy)
            {
                return;
            }

            if (string.IsNullOrWhiteSpace(filePathBox.Text) || !File.Exists(filePathBox.Text))
            {
                MessageBox.Show(this, "請先選擇有效的影音檔案。", "尚未選擇檔案", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            string missing = FindMissingRuntimeFile();
            if (missing != null)
            {
                MessageBox.Show(this, "程式缺少必要檔案：\n" + missing + "\n\n請保留 _runtime 資料夾，不要將它刪除。", "無法啟動辨識", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }

            diagnosticLog = string.Empty;
            lastOutputFile = null;
            transcriptBox.Text = string.Empty;
            SetBusyState(true);
            progressBar.Style = ProgressBarStyle.Marquee;
            progressBar.MarqueeAnimationSpeed = 28;
            statusLabel.Text = "正在準備音訊...";
            detailLabel.Text = "長檔案會自動分段，請保持程式開啟。";

            TranscriptionRequest request = new TranscriptionRequest();
            request.InputPath = filePathBox.Text;
            request.Language = languageBox.SelectedIndex == 1 ? "zh" : (languageBox.SelectedIndex == 2 ? "en" : "auto");
            request.MakeSrt = srtCheckBox.Checked;
            worker.RunWorkerAsync(request);
        }

        private string FindMissingRuntimeFile()
        {
            string[] required = new string[]
            {
                Path.Combine(appRoot, "_runtime", "tools", "ffmpeg.exe"),
                Path.Combine(appRoot, "_runtime", "tools", "whisper-cli.exe"),
                Path.Combine(appRoot, "_runtime", "models", "ggml-small.bin")
            };

            foreach (string path in required)
            {
                if (!File.Exists(path))
                {
                    return path;
                }
            }
            return null;
        }

        private void CancelButton_Click(object sender, EventArgs e)
        {
            if (!worker.IsBusy)
            {
                return;
            }

            cancelButton.Enabled = false;
            statusLabel.Text = "正在取消...";
            worker.CancelAsync();
            lock (processLock)
            {
                try
                {
                    if (currentProcess != null && !currentProcess.HasExited)
                    {
                        currentProcess.Kill();
                    }
                }
                catch
                {
                }
            }
        }

        private void OutputButton_Click(object sender, EventArgs e)
        {
            string folder = GetOutputFolder();
            Directory.CreateDirectory(folder);
            Process.Start("explorer.exe", Quote(folder));
        }

        private void CopyButton_Click(object sender, EventArgs e)
        {
            if (!string.IsNullOrWhiteSpace(transcriptBox.Text))
            {
                Clipboard.SetText(transcriptBox.Text);
                detailLabel.Text = "逐字稿已複製到剪貼簿。";
            }
        }

        private void Worker_DoWork(object sender, DoWorkEventArgs e)
        {
            TranscriptionRequest request = (TranscriptionRequest)e.Argument;
            string jobFolder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "CraneTranscript", "work", Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(jobFolder);

            SetKeepAwake(true);
            try
            {
                ThrowIfCancelled(e);
                UpdateStatus("正在準備本機辨識引擎...", "第一次使用會複製模型到 Windows 本機資料夾。");
                string runtimeRoot = EnsureLocalRuntime(e);
                string ffmpeg = Path.Combine(runtimeRoot, "tools", "ffmpeg.exe");
                string whisper = Path.Combine(runtimeRoot, "tools", "whisper-cli.exe");
                string model = Path.Combine(runtimeRoot, "models", "ggml-small.bin");
                string chunkPattern = Path.Combine(jobFolder, "chunk-%03d.wav");

                UpdateStatus("正在擷取音訊並切成 30 分鐘片段...", "影片只會取出聲音；原始檔不會被修改。");
                string ffmpegArguments = "-hide_banner -loglevel error -y -i " + Quote(request.InputPath)
                    + " -map 0:a:0 -vn -ar 16000 -ac 1 -c:a pcm_s16le -f segment -segment_time " + SegmentSeconds.ToString(CultureInfo.InvariantCulture)
                    + " -reset_timestamps 1 " + Quote(chunkPattern);
                RunProcess(ffmpeg, ffmpegArguments, jobFolder, e);

                string[] chunks = Directory.GetFiles(jobFolder, "chunk-*.wav");
                Array.Sort(chunks, StringComparer.OrdinalIgnoreCase);
                if (chunks.Length == 0)
                {
                    throw new InvalidOperationException("找不到可辨識的音軌。請確認檔案內含聲音，或改用其他影音格式。");
                }

                BeginInvoke(new Action(delegate
                {
                    progressBar.Style = ProgressBarStyle.Blocks;
                    progressBar.Minimum = 0;
                    progressBar.Maximum = chunks.Length;
                    progressBar.Value = 0;
                }));

                List<string> textParts = new List<string>();
                List<string> srtParts = new List<string>();
                int threads = Math.Max(2, Environment.ProcessorCount - 1);

                for (int i = 0; i < chunks.Length; i++)
                {
                    ThrowIfCancelled(e);
                    string prefix = Path.Combine(jobFolder, "result-" + i.ToString("000", CultureInfo.InvariantCulture));
                    UpdateStatus("正在辨識第 " + (i + 1) + " / " + chunks.Length + " 段...", "辨識速度會依電腦效能與錄音清晰度而不同。");

                    string whisperArguments = "-m " + Quote(model)
                        + " -f " + Quote(chunks[i])
                        + " -l " + request.Language
                        + " -t " + threads.ToString(CultureInfo.InvariantCulture)
                        + " -otxt -of " + Quote(prefix)
                        + (request.MakeSrt ? " -osrt" : string.Empty)
                        + " -np";
                    RunProcess(whisper, whisperArguments, jobFolder, e);

                    string textFile = prefix + ".txt";
                    if (!File.Exists(textFile))
                    {
                        throw new InvalidOperationException("辨識引擎沒有產生逐字稿檔案。");
                    }
                    textParts.Add(File.ReadAllText(textFile, Encoding.UTF8).Trim());

                    if (request.MakeSrt)
                    {
                        string srtFile = prefix + ".srt";
                        if (File.Exists(srtFile))
                        {
                            srtParts.Add(File.ReadAllText(srtFile, Encoding.UTF8));
                        }
                    }
                    worker.ReportProgress(i + 1, chunks.Length);
                }

                ThrowIfCancelled(e);
                UpdateStatus("正在合併完整逐字稿...", "即將完成。");

                string outputFolder = GetOutputFolder();
                Directory.CreateDirectory(outputFolder);
                string sourceName = MakeSafeFileName(Path.GetFileNameWithoutExtension(request.InputPath));
                string outputBase = Path.Combine(outputFolder, sourceName + "_逐字稿_" + DateTime.Now.ToString("yyyyMMdd-HHmmss", CultureInfo.InvariantCulture));
                string finalText = string.Join(Environment.NewLine + Environment.NewLine, textParts.ToArray()).Trim() + Environment.NewLine;
                File.WriteAllText(outputBase + ".txt", finalText, new UTF8Encoding(true));

                if (request.MakeSrt && srtParts.Count > 0)
                {
                    string mergedSrt = MergeSrt(srtParts);
                    File.WriteAllText(outputBase + ".srt", mergedSrt, new UTF8Encoding(true));
                }

                TranscriptionResult result = new TranscriptionResult();
                result.TextPath = outputBase + ".txt";
                result.Text = finalText;
                result.SrtCreated = request.MakeSrt && File.Exists(outputBase + ".srt");
                e.Result = result;
            }
            finally
            {
                SetKeepAwake(false);
                try
                {
                    if (Directory.Exists(jobFolder))
                    {
                        Directory.Delete(jobFolder, true);
                    }
                }
                catch
                {
                }
            }
        }

        private void RunProcess(string fileName, string arguments, string workingDirectory, DoWorkEventArgs e)
        {
            ProcessStartInfo startInfo = new ProcessStartInfo();
            startInfo.FileName = fileName;
            startInfo.Arguments = arguments;
            startInfo.WorkingDirectory = workingDirectory;
            startInfo.UseShellExecute = false;
            startInfo.CreateNoWindow = true;
            startInfo.RedirectStandardOutput = true;
            startInfo.RedirectStandardError = true;
            startInfo.StandardOutputEncoding = Encoding.UTF8;
            startInfo.StandardErrorEncoding = Encoding.UTF8;

            StringBuilder processLog = new StringBuilder();
            Process process = new Process();
            process.StartInfo = startInfo;
            process.OutputDataReceived += delegate(object sender, DataReceivedEventArgs args)
            {
                if (!string.IsNullOrEmpty(args.Data))
                {
                    lock (processLog) { processLog.AppendLine(args.Data); }
                }
            };
            process.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs args)
            {
                if (!string.IsNullOrEmpty(args.Data))
                {
                    lock (processLog) { processLog.AppendLine(args.Data); }
                }
            };

            lock (processLock)
            {
                currentProcess = process;
            }

            try
            {
                process.Start();
                process.BeginOutputReadLine();
                process.BeginErrorReadLine();
                while (!process.WaitForExit(300))
                {
                    ThrowIfCancelled(e);
                }
                process.WaitForExit();

                string log;
                lock (processLog) { log = processLog.ToString(); }
                diagnosticLog += log;
                if (worker.CancellationPending)
                {
                    e.Cancel = true;
                    throw new OperationCanceledException();
                }
                if (process.ExitCode != 0)
                {
                    throw new InvalidOperationException("影音處理失敗。\n" + LastCharacters(log, 1200));
                }
            }
            finally
            {
                lock (processLock)
                {
                    currentProcess = null;
                }
                process.Dispose();
            }
        }

        private string EnsureLocalRuntime(DoWorkEventArgs e)
        {
            string packagedRoot = Path.Combine(appRoot, "_runtime");
            string localRoot = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "CraneTranscript", "runtime-v183-small");
            string[] relativeFiles = new string[]
            {
                Path.Combine("tools", "ffmpeg.exe"),
                Path.Combine("tools", "whisper-cli.exe"),
                Path.Combine("tools", "ggml-base.dll"),
                Path.Combine("tools", "ggml-cpu.dll"),
                Path.Combine("tools", "ggml.dll"),
                Path.Combine("tools", "SDL2.dll"),
                Path.Combine("tools", "whisper.dll"),
                Path.Combine("models", "ggml-small.bin")
            };

            foreach (string relativePath in relativeFiles)
            {
                ThrowIfCancelled(e);
                string source = Path.Combine(packagedRoot, relativePath);
                string destination = Path.Combine(localRoot, relativePath);
                FileInfo sourceInfo = new FileInfo(source);
                FileInfo destinationInfo = new FileInfo(destination);

                if (!destinationInfo.Exists || destinationInfo.Length != sourceInfo.Length)
                {
                    Directory.CreateDirectory(Path.GetDirectoryName(destination));
                    File.Copy(source, destination, true);
                }
            }

            return localRoot;
        }

        private void ThrowIfCancelled(DoWorkEventArgs e)
        {
            if (worker.CancellationPending)
            {
                e.Cancel = true;
                throw new OperationCanceledException();
            }
        }

        private void Worker_ProgressChanged(object sender, ProgressChangedEventArgs e)
        {
            if (progressBar.Style == ProgressBarStyle.Blocks)
            {
                progressBar.Value = Math.Min(progressBar.Maximum, Math.Max(progressBar.Minimum, e.ProgressPercentage));
            }
        }

        private void Worker_RunWorkerCompleted(object sender, RunWorkerCompletedEventArgs e)
        {
            SetBusyState(false);
            progressBar.Style = ProgressBarStyle.Blocks;
            progressBar.Value = 0;

            if (e.Cancelled || e.Error is OperationCanceledException)
            {
                statusLabel.Text = "已取消";
                detailLabel.Text = "暫存檔已清理，原始影音檔沒有變更。";
                return;
            }

            if (e.Error != null)
            {
                statusLabel.Text = "處理失敗";
                detailLabel.Text = "請查看錯誤訊息，確認影音檔可以正常播放。";
                SaveDiagnosticLog();
                MessageBox.Show(this, e.Error.Message, "無法完成逐字稿", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }

            TranscriptionResult result = (TranscriptionResult)e.Result;
            lastOutputFile = result.TextPath;
            transcriptBox.Text = result.Text;
            copyButton.Enabled = true;
            statusLabel.Text = "逐字稿完成";
            detailLabel.Text = result.SrtCreated ? "已輸出 TXT 逐字稿與 SRT 字幕檔。" : "已輸出 TXT 逐字稿。";
            progressBar.Maximum = 1;
            progressBar.Value = 1;

            DialogResult open = MessageBox.Show(this, "逐字稿已完成並儲存。\n\n要立即開啟輸出資料夾嗎？", "完成", MessageBoxButtons.YesNo, MessageBoxIcon.Information);
            if (open == DialogResult.Yes)
            {
                Process.Start("explorer.exe", "/select," + Quote(lastOutputFile));
            }
        }

        private void SetBusyState(bool busy)
        {
            chooseButton.Enabled = !busy;
            startButton.Enabled = !busy;
            languageBox.Enabled = !busy;
            srtCheckBox.Enabled = !busy;
            cancelButton.Enabled = busy;
            AllowDrop = !busy;
        }

        private void UpdateStatus(string status, string detail)
        {
            BeginInvoke(new Action(delegate
            {
                statusLabel.Text = status;
                detailLabel.Text = detail;
            }));
        }

        private string GetOutputFolder()
        {
            return Path.Combine(appRoot, "逐字稿輸出");
        }

        private static string MakeSafeFileName(string name)
        {
            foreach (char invalid in Path.GetInvalidFileNameChars())
            {
                name = name.Replace(invalid, '_');
            }
            return string.IsNullOrWhiteSpace(name) ? "未命名" : name.Trim();
        }

        private static string MergeSrt(List<string> parts)
        {
            StringBuilder output = new StringBuilder();
            int sequence = 1;

            for (int partIndex = 0; partIndex < parts.Count; partIndex++)
            {
                string normalized = parts[partIndex].Replace("\r\n", "\n").Replace("\r", "\n");
                string[] blocks = normalized.Split(new string[] { "\n\n" }, StringSplitOptions.RemoveEmptyEntries);
                TimeSpan offset = TimeSpan.FromSeconds((long)partIndex * SegmentSeconds);

                foreach (string rawBlock in blocks)
                {
                    string[] lines = rawBlock.Trim().Split('\n');
                    if (lines.Length < 3)
                    {
                        continue;
                    }

                    int timeLineIndex = lines[0].Contains("-->") ? 0 : 1;
                    if (timeLineIndex >= lines.Length || !lines[timeLineIndex].Contains("-->"))
                    {
                        continue;
                    }

                    string[] times = lines[timeLineIndex].Split(new string[] { "-->" }, StringSplitOptions.None);
                    if (times.Length != 2)
                    {
                        continue;
                    }

                    TimeSpan start;
                    TimeSpan end;
                    if (!TryParseSrtTime(times[0].Trim(), out start) || !TryParseSrtTime(times[1].Trim(), out end))
                    {
                        continue;
                    }

                    output.AppendLine(sequence.ToString(CultureInfo.InvariantCulture));
                    output.AppendLine(FormatSrtTime(start + offset) + " --> " + FormatSrtTime(end + offset));
                    for (int lineIndex = timeLineIndex + 1; lineIndex < lines.Length; lineIndex++)
                    {
                        output.AppendLine(lines[lineIndex]);
                    }
                    output.AppendLine();
                    sequence++;
                }
            }
            return output.ToString();
        }

        private static bool TryParseSrtTime(string value, out TimeSpan result)
        {
            return TimeSpan.TryParseExact(value, @"hh\:mm\:ss\,fff", CultureInfo.InvariantCulture, out result);
        }

        private static string FormatSrtTime(TimeSpan value)
        {
            int hours = (int)value.TotalHours;
            return hours.ToString("00", CultureInfo.InvariantCulture) + ":"
                + value.Minutes.ToString("00", CultureInfo.InvariantCulture) + ":"
                + value.Seconds.ToString("00", CultureInfo.InvariantCulture) + ","
                + value.Milliseconds.ToString("000", CultureInfo.InvariantCulture);
        }

        private static string Quote(string value)
        {
            return "\"" + value.Replace("\"", "\\\"") + "\"";
        }

        private static string LastCharacters(string value, int maximum)
        {
            if (string.IsNullOrEmpty(value) || value.Length <= maximum)
            {
                return value;
            }
            return value.Substring(value.Length - maximum);
        }

        private void SaveDiagnosticLog()
        {
            try
            {
                string folder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "CraneTranscript");
                Directory.CreateDirectory(folder);
                File.WriteAllText(Path.Combine(folder, "last-error.log"), diagnosticLog, new UTF8Encoding(true));
            }
            catch
            {
            }
        }

        private void MainForm_FormClosing(object sender, FormClosingEventArgs e)
        {
            if (!worker.IsBusy)
            {
                return;
            }

            DialogResult result = MessageBox.Show(this, "逐字稿仍在處理中，確定要停止並關閉嗎？", "正在處理", MessageBoxButtons.YesNo, MessageBoxIcon.Warning);
            if (result == DialogResult.No)
            {
                e.Cancel = true;
                return;
            }

            worker.CancelAsync();
            lock (processLock)
            {
                try
                {
                    if (currentProcess != null && !currentProcess.HasExited)
                    {
                        currentProcess.Kill();
                    }
                }
                catch
                {
                }
            }
        }

        [DllImport("kernel32.dll")]
        private static extern uint SetThreadExecutionState(uint executionState);

        private static void SetKeepAwake(bool keepAwake)
        {
            const uint EsContinuous = 0x80000000;
            const uint EsSystemRequired = 0x00000001;
            SetThreadExecutionState(keepAwake ? EsContinuous | EsSystemRequired : EsContinuous);
        }

        private sealed class TranscriptionRequest
        {
            public string InputPath;
            public string Language;
            public bool MakeSrt;
        }

        private sealed class TranscriptionResult
        {
            public string TextPath;
            public string Text;
            public bool SrtCreated;
        }
    }
}
