# すべての設定

設定のすべてのセクションとその内容を、アプリに表示される順に並べ、それぞれの場所と、このガイドの説明部分へのリンクを付けています。何がどこで設定できるかを探すときに使ってください。使い方は各トピックで説明しています。

## 設定の構成

アイコンバーから**設定**を開きます。パソコンでは、設定の左側にライブラリと同じような列があり、すべてのセクションが3つの見出しの下に1つのリストで並んでいます。**アプリ**（アプリそのもの）、**エージェント**（エージェントと、エージェントが読むもの）、**機能**（アプリがすべてのエージェントに加える機能：検索、ブラウザ、メモリなど）です。セクションをクリックすると、そのタイトルの下にページいっぱいに表示されます。**サイドバーを隠す**（Ctrl+B）で列を隠し、タイトルの先頭にある**サイドバーを表示**で元に戻せます。スマートフォンでは、設定のすべてのセクションが1つのリストに表示されます。タップして開き、上部の矢印で戻ります。

オプションの場所を知らなくてもかまいません。検索ボックス（Ctrl+K、Macでは⌘K）に「ダークモード」や「通知」のように探しているものを入力して選ぶと、アプリが正しいセクションを開き、そのオプションを示します。どのエージェントにも設定の変更を頼めます（[エージェントにアプリを操作してもらう](/guide/ask-agents)）。

## アプリ

### 一般

[設定 → 一般](/settings?s=general)：テーマと、エージェントの作業中のEnterの動作。詳しくは[外観、言語、アップデート](/guide/app)。

- [**外観**](/settings?s=general&find=Appearance)：ダーク、ライト、デバイスに合わせる、または専用のテーマ。
- [**新しいテーマ**](/settings?s=general&find=New%20theme)：いずれかを元に自分用のテーマを作成。
- [**インポート**](/settings?s=general&find=Import)：共有されたテーマを追加。
- [**言語**](/settings?s=general&find=Language)：アプリの表示言語と、エージェントが書く言語。
- [**動き**](/settings?s=general&find=Motion)：アプリの動きの量：フル、控えめ（ページやウィンドウを開くときにスライドやフェードをしない）、またはなし。
- [**文字サイズ**](/settings?s=general&find=Text%20size)：この端末でのメッセージ、ヘルプページ、入力ボックスの文字の大きさ：標準、大、特大。
- [**エージェントの作業中に送信**](/settings?s=general&find=Sending%20while%20an%20agent%20works)：Enterで実行中のターンに加わるか、終わるまで待ちます。
- [**ターミナルのサジェスト**](/settings?s=general&find=Terminal%20suggestions)：ターミナルでカーソルの後ろに表示されるグレーの入力候補。
- [**使用量の上限後に再開**](/settings?s=general&find=Resume%20after%20usage%20limits)：プランの上限がリセットされた1分後にセッションを続行します。
- [**非アクティブなセッションを削除**](/settings?s=general&find=Delete%20inactive%20sessions)：1年間、または選んだ期間、誰も使っていないセッションを削除します。それまではすべての会話が保持されます。
- [**セッションごとに制限**](/settings?s=general&find=Limit%20each%20session)：1つのセッションのプログラムが使えるメモリとプロセッサの上限。
- [**このコンピューターの起動時に開始**](/settings?s=general&find=Start%20when%20this%20computer%20starts)：コンピューターの起動時にアプリを起動します。
- [**コンピューターをスリープさせない**](/settings?s=general&find=Keep%20the%20computer%20awake)：デスクトップアプリで、エージェントの作業中とスケジュールタスクの前に、コンピューターが自動でスリープしないようにします。
- [**自動で更新**](/settings?s=general&find=Update%20automatically)：新しいバージョンを自動でインストールします：デスクトップアプリは公開後すぐに（1分前に通知）、gitのコピーはしばらく使っていないときに。
- [**ツアーを始める**](/settings?s=general&find=Take%20the%20tour)：アプリの各部分の機能を確認。
- [**ヒント**](/settings?s=general&find=Tips)：ウェルカムツアーの後、アプリの各部分に初めて来たときにその部分を案内します。
- [**スターターアイデア**](/settings?s=general&find=Starter%20ideas)：スタートページの空のメッセージ欄の下に表示する例、アプリ、自動化。
- [**今すぐ確認**](/settings?s=general&find=Check%20now)：今すぐ新しいバージョンを確認。

### 通知

[設定 → 通知](/settings?s=notifications)：セッションが完了したとき、失敗したとき、回答が必要なとき。詳しくは[受信トレイと通知](/guide/inbox)。

- [**この端末に通知**](/settings?s=notifications&find=Notify%20this%20device)：セッションの完了、失敗、回答待ちをお知らせします。アプリを閉じていても届きます。
- [**音声**](/settings?s=notifications&find=Sound)：アプリを開いている間、通知のたびに短いチャイムを鳴らします。
- [**テストを送信**](/settings?s=notifications&find=Send%20a%20test)：このデバイスに今すぐ通知を送信。

### スマートフォンで使う

[設定 → スマートフォンで使う](/settings?s=phone)：Tailscaleで非公開のまま自分のスマートフォンでアプリを開き、通知もそこで受け取ります。詳しくは[スマートフォン、他のマシン、共有](/guide/devices)。

- [**自分の端末に公開**](/settings?s=phone&find=Serve%20it%20on%20my%20devices)：アプリをHTTPSで公開します。公開先はTailscaleアカウントにサインインしているデバイスのみで、公開インターネットには出しません。
- [**このコンピューターのTailscale**](/settings?s=phone&find=Tailscale%20on%20this%20computer)：ここでTailscaleがインストールされ、サインインしているか。tailnet上でのこのコンピューターの名前。
- [**スマートフォンで開く**](/settings?s=phone&find=Open%20it%20on%20your%20phone)：スマートフォンのカメラで読み取れるアプリのアドレスのQRコードと、スマートフォンでの手順。
- [**公開を停止**](/settings?s=phone&find=Stop%20serving)：アプリをtailnetから外し、「自分のデバイスで公開」で行った設定を完全に元に戻します。
- [**ホーム画面に追加**](/settings?s=phone&find=Add%20to%20Home%20Screen)：スマートフォンで：専用アイコンでフルスクリーンのHydor。iPhoneの通知にはこれが必要です。

### チャットアプリ

[設定 → チャットアプリ](/settings?s=chat)：Telegram、Discord、Slackからエージェントと会話：セッションの開始、写真・ファイル・音声メッセージの送信、返信の受け取り、質問への回答ができます。詳しくは[スマートフォン、他のマシン、共有](/guide/devices)。

- [**Telegram**](/settings?s=chat&find=Telegram)：@BotFatherで作成した専用のTelegramボット。チャットがこのボットと会話します。
- [**Discord**](/settings?s=chat&find=Discord)：Developer Portalで作成した専用のDiscordボット。チャットがこのボットと会話します。
- [**Slack**](/settings?s=chat&find=Slack)：マニフェストから作成した専用のSlackアプリ。チャットがこのアプリと会話します。
- [**チャットをリンク**](/settings?s=chat&find=Link%20a%20chat)：1回だけ使えるコードで、Telegram、Discord、Slackのチャットからエージェントを使えるようにします。
- [**ボットをサーバーに追加**](/settings?s=chat&find=Add%20the%20bot%20to%20a%20server)：必要な権限を付けて、Discordボットを自分のサーバーに追加するリンク。
- [**マニフェストをコピー**](/settings?s=chat&find=Copy%20manifest)：ソケットモードと必要なスコープを含むSlackアプリのマニフェスト。アプリの作成時に貼り付けます。
- [**新しいセッションで使うもの**](/settings?s=chat&find=New%20sessions%20use)：チャットがどのセッションにも属していないときに、チャットのメッセージが開始するエージェント。
- [**新しいセッションのエージェント**](/settings?s=chat&find=New%20sessions%20as)：チャットから新しいセッションを開始するときに使うエージェント。チャットで/asを使うと別のエージェントを選べます。
- [**すべてのセッションからの通知**](/settings?s=chat&find=Notices%20from%20every%20session)：チャットが開始したセッションだけでなく、すべてのセッションの通知をチャットに表示。

### パスワード

[設定 → パスワード](/settings?s=security)：このアプリのパスワードとサインアウト。詳しくは[外観、言語、アップデート](/guide/app)。

- [**パスワードを変更**](/settings?s=security&find=Change%20password)：変更すると、ほかのすべてのブラウザがサインアウトされます。
- [**このブラウザをサインアウト**](/settings?s=security&find=Sign%20out%20of%20this%20browser)：戻るにはパスワードが必要です。

### 署名

[設定 → 署名](/settings?s=signatures)：署名するドキュメント用に、一度描いた署名とイニシャルを暗号化して保管します。詳しくは[ページ、ドキュメント、画像](/guide/library)。

- [**新しい署名**](/settings?s=signatures&find=New%20signature)：署名またはイニシャルを描く、入力する、アップロードする。

### ソース管理

[設定 → ソース管理](/settings?s=scm)：プルリクエストを開くためのGitHubとGiteaのアカウント。詳しくは[スマートフォン、他のマシン、共有](/guide/devices)。

- [**アカウントを追加**](/settings?s=scm&find=Add%20an%20account)：プルリクエストを開くためのアカウント。

### ほかのエージェントを接続

[設定 → ほかのエージェントを接続](/settings?s=connect)：このアプリのMCPサーバー経由で、ほかの場所にあるエージェントがここでセッションを開始・操作できるようにします。詳しくは[スマートフォン、他のマシン、共有](/guide/devices)。

- [**新しいトークン**](/settings?s=connect&find=New%20token)：別の場所にいるエージェントが、ここでセッションを開始して操作するためのトークン。
- [**できること**](/settings?s=connect&find=What%20they%20can%20do)：トークンを持つエージェントが使えるツール。

### マシン

[設定 → マシン](/settings?s=machines)：Hydorが動くほかのマシン（ここから使う用）と、このマシンへのアクセス。詳しくは[スマートフォン、他のマシン、共有](/guide/devices)。

- [**マシンを追加**](/settings?s=machines&find=Add%20a%20machine)：ここから使う、Hydorが動いている別のマシン。
- [**ほかのマシンからのアクセス**](/settings?s=machines&find=Access%20from%20other%20machines)：他のマシンがこのマシンに接続するためのトークン。

## エージェント

### アカウント

[設定 → アカウント](/settings?s=accounts)：すべてのセッションが使うClaude Code、Codex、Grok Buildのサインイン。詳しくは[エージェント、アカウント、モデル](/guide/agents-models)。

- [**アカウント**](/settings?s=accounts&find=Accounts)：セッションが使うClaude Code、Codex、Grok Buildのサインインと、追加したその他のサインイン。
- [**上限時にアカウントを切り替え**](/settings?s=accounts&find=Switch%20accounts%20at%20a%20limit)：使用量を使い切ったセッションは、別のアカウントで続行します。
- [**上限時にAPIクレジットを使う**](/settings?s=accounts&find=Use%20API%20credit%20at%20a%20limit)：すべてのClaude Codeアカウントが上限に達したとき、セッションはAnthropic APIキーの課金で続行されます。
- [**エージェントプログラム**](/settings?s=accounts&find=Agent%20programs)：Grok Buildを含め、どのエージェントプログラムがインストールされているか。他のプログラムのインストール。
- [**自動で更新**](/settings?s=accounts&find=Update%20automatically)：Claude Code、Codex、その他のエージェントプログラムを常に最新バージョンに保ちます。

### その他のエージェント

[設定 → その他のエージェント](/settings?s=agents)：Gemini CLI、Grok Build、OpenCode、Goose、そのほかACPに対応したエージェント。詳しくは[エージェント、アカウント、モデル](/guide/agents-models)。

- [**自分のエージェント**](/settings?s=agents&find=Your%20agents)：Claude CodeやCodexと並んで表示されるエージェント。
- [**自分で追加**](/settings?s=agents&find=Add%20your%20own)：ACPに対応したエージェントを、コマンドで追加。
- [**ACPに対応したエージェント**](/settings?s=agents&find=Agents%20that%20speak%20ACP)：追加できるGemini CLI、OpenCode、Qwen Code、Goose、Grok Build。

### モデル

[設定 → モデル](/settings?s=models)：アプリ独自のエージェントCustom用のモデル：Claude CodeとCodex経由のClaudeやChatGPTのプラン、このコンピューター上のモデル、クラウドのOpenRouterなどのプロバイダー。詳しくは[エージェント、アカウント、モデル](/guide/agents-models)。

- [**補助モデル**](/settings?s=models&find=Helper%20model)：セッションとは別の、小さな作業用のモデル。
- [**ティア**](/settings?s=models&find=Tiers)：各プログラムで高速、標準、最高、最大が指すモデル：セッションは最高または最大で進行し、サブエージェントは標準と高速を使います。
- [**サブエージェントを主導**](/settings?s=models&find=Lead%20with%20subagents)：セッションの主エージェントが計画を立て、明確な部分をより低いティアのサブエージェントに任せ、その成果を確認します。
- [**難問には最大**](/settings?s=models&find=Max%20for%20hard%20problems)：自動の主エージェントは、最高では手に負えない難しい問題だと分かると、自分で最大に切り替えることがあります。
- [**契約中のサブスクリプション**](/settings?s=models&find=Your%20subscriptions)：ClaudeとChatGPTのプランのモデル。CustomがClaude CodeとCodex経由で使えます。
- [**このマシン上**](/settings?s=models&find=On%20this%20machine)：ここにインストールされているモデルとそのダウンロード。
- [**Hugging Faceからモデルを追加**](/settings?s=models&find=Add%20a%20model%20from%20Hugging%20Face)：このコンピューター向けのおすすめ、または検索して、ここでの動作を確認し、インストールします。
- [**OpenRouter**](/settings?s=models&find=OpenRouter)：OpenRouter経由のモデル（自分のキーを使用）。
- [**ランタイムとエンドポイント**](/settings?s=models&find=Runtimes%20and%20endpoints)：Ollama、vLLM、その他のOpenAI互換エンドポイント。
- [**Hugging Faceトークン**](/settings?s=models&find=Hugging%20Face%20token)：制限付きまたは非公開のモデル専用。

### エージェントガイドライン

[設定 → エージェントガイドライン](/settings?s=guidelines)：すべてのエージェントが従う内容：すべてのセッション、プロジェクト、または1つのセッションで。詳しくは[エージェントガイドライン](/guide/guidelines)。

- [**すべてのセッション用**](/settings?s=guidelines&find=For%20every%20session)：すべてのセッションで、すべてのエージェントが従う内容。
- [**プロジェクト用**](/settings?s=guidelines&find=For%20a%20project)：プロジェクト内のセッションが従うガイドライン。
- [**1つのセッション用**](/settings?s=guidelines&find=For%20one%20session)：スタートページまたはセッションのメニューから設定する、1つのセッションのガイドライン。
- [**指示ファイル**](/settings?s=guidelines&find=Instruction%20files)：Claude CodeとCodexが自動で読むCLAUDE.mdとAGENTS.md。

### MCPサーバー

[設定 → MCPサーバー](/settings?s=mcp)：エージェントが呼び出せるツール。詳しくは[接続済みアプリ、キー、ツール](/guide/connections)。

- [**サーバーを追加**](/settings?s=mcp&find=Add%20server)：Claude CodeやCodex用のツールサーバー。
- [**接続を確認**](/settings?s=mcp&find=Check%20connections)：各MCPサーバーが応答するかを確認。

### スキル

[設定 → スキル](/settings?s=skills)：タスクに必要なときにエージェントが読み込む手順書：組み込み、自作、プラグイン由来、エージェント独自のもの。詳しくは[スキル](/guide/skills)。

- [**新しいスキル**](/settings?s=skills&find=New%20skill)：すべてのエージェント、またはClaude CodeかCodexだけに向けたスキルを書く。
- [**組み込み**](/settings?s=skills&find=Built%20in)：アプリに付属するスキル。
- [**自分用**](/settings?s=skills&find=Yours)：自分で書いたスキル、またはエージェントが提案して承認したスキル。
- [**プラグインから**](/settings?s=skills&find=From%20plugins)：プラグインが提供するスキル。
- [**Claude CodeとCodex**](/settings?s=skills&find=Claude%20Code%20and%20Codex)：エージェント専用のスキル（そのエージェントだけが使えます）。
- [**合うスキルを提案**](/settings?s=skills&find=Suggest%20skills%20that%20fit)：新しいセッションのエージェントが、最初のメッセージに合うスキルを知ることができます。
- [**キーワードでスキルを呼び出す**](/settings?s=skills&find=Bring%20skills%20in%20by%20keywords)：メッセージ内のキーワードでスキルが自動で読み込まれます。
- [**自分用のバージョンを作る**](/settings?s=skills&find=Make%20my%20own%20version)：組み込みスキルを変更：変更したバージョンが置き換わります。

### プラグイン

[設定 → プラグイン](/settings?s=plugins)：すべてのエージェントにスキル、ツール、指示を加える追加機能。詳しくは[接続済みアプリ、キー、ツール](/guide/connections)。

- [**自分のプラグイン**](/settings?s=plugins&find=Your%20plugins)：追加したプラグイン（すべてのエージェントでオンまたはオフ）。
- [**アプリに付属**](/settings?s=plugins&find=Come%20with%20the%20app)：アプリに付属する、追加可能なプラグイン。
- [**プラグインを作成**](/settings?s=plugins&find=Make%20a%20plugin)：独自のスキル、ツール、指示、ファイルをプラグインとしてまとめる。
- [**リンクから**](/settings?s=plugins&find=From%20a%20link)：GitHubなどのGitアドレスからプラグインを追加。
- [**.zipファイルから**](/settings?s=plugins&find=From%20a%20.zip%20file)：.zipにまとめられたプラグインを追加。
- [**.zipにまとめる**](/settings?s=plugins&find=Pack%20into%20a%20.zip)：共有できる1ファイルのプラグイン。
- [**Claude Code**](/settings?s=plugins&find=Claude%20Code)：Claude Code独自のプラグインとマーケットプレイス。
- [**Codex**](/settings?s=plugins&find=Codex)：Codex独自のプラグインとマーケットプレイス。

### スケジュールタスク

[設定 → スケジュールタスク](/settings?s=tasks)：スケジュール、1回限り、Webhookの呼び出しなどで、自動的に始まるエージェントの作業。詳しくは[スケジュールタスク](/guide/tasks)。

- [**新しいタスク**](/settings?s=tasks&find=New%20task)：自動で始まるエージェントの作業。
- [**週表示**](/settings?s=tasks&find=Week%20view)：自動で実行されるものすべてを週単位で表示：実行済みのものと次の実行。
- [**例から始める**](/settings?s=tasks&find=Start%20from%20an%20example)：すぐに使えるスケジュールタスク。
- [**朝のブリーフ**](/settings?s=tasks&find=Morning%20brief)：すぐ使えるスケジュールタスク。
- [**トピックのニュース**](/settings?s=tasks&find=News%20on%20a%20topic)：すぐ使えるスケジュールタスク。
- [**価格ウォッチ**](/settings?s=tasks&find=Price%20watch)：すぐ使えるスケジュールタスク。
- [**ページ変更アラート**](/settings?s=tasks&find=Page%20change%20alert)：すぐ使えるスケジュールタスク。
- [**フォルダからの週次レポート**](/settings?s=tasks&find=Weekly%20report%20from%20a%20folder)：すぐ使えるスケジュールタスク。
- [**受信トレイダイジェスト**](/settings?s=tasks&find=Inbox%20digest)：すぐ使えるスケジュールタスク。
- [**習慣のチェックイン**](/settings?s=tasks&find=Habit%20check-in)：すぐ使えるスケジュールタスク。
- [**新しいリリース**](/settings?s=tasks&find=New%20releases)：すぐ使えるスケジュールタスク。
- [**サイト稼働チェック**](/settings?s=tasks&find=Site%20up%20check)：すぐ使えるスケジュールタスク。
- [**ディスク容量アラート**](/settings?s=tasks&find=Disk%20space%20alert)：すぐ使えるスケジュールタスク。
- [**新しいプルリクエストをレビュー**](/settings?s=tasks&find=Review%20new%20pull%20requests)：すぐ使えるスケジュールタスク。
- [**CIドクター**](/settings?s=tasks&find=CI%20doctor)：すぐ使えるスケジュールタスク。
- [**Issueトリアージ**](/settings?s=tasks&find=Issue%20triage)：すぐ使えるスケジュールタスク。
- [**依存関係ガーデナー**](/settings?s=tasks&find=Dependency%20gardener)：すぐ使えるスケジュールタスク。
- [**インシデント初動対応**](/settings?s=tasks&find=Incident%20first%20responder)：すぐ使えるスケジュールタスク。
- [**フォルダ内の新しいファイル**](/settings?s=tasks&find=New%20files%20in%20a%20folder)：すぐ使えるスケジュールタスク。
- [**リマインダー**](/settings?s=tasks&find=Reminder)：すぐ使えるスケジュールタスク。

## 機能

### 検索

[設定 → 検索](/settings?s=search)：エージェントのWeb検索の仕組み：Naget Searchとその他のプロバイダ。詳しくは[検索とブラウザ](/guide/web)。

- [**プロバイダ**](/settings?s=search&find=Providers)：エージェントが使う検索プロバイダと、その順序。
- [**Naget検索**](/settings?s=search&find=Naget%20Search)：アプリ独自のウェブ検索。
- [**SearXNG**](/settings?s=search&find=SearXNG)：自分で動かす検索エンジン。
- [**Brave Search**](/settings?s=search&find=Brave%20Search)：Braveのキーでウェブ検索。
- [**DuckDuckGo**](/settings?s=search&find=DuckDuckGo)：キーなしでウェブ検索。
- [**1回の検索あたりの結果数**](/settings?s=search&find=Results%20per%20search)：検索で表示する結果の数。

### ブラウザ

[設定 → ブラウザ](/settings?s=browser)：エージェントが使うウェブブラウザ。様子を見たり、操作を引き継いだりできます。詳しくは[検索とブラウザ](/guide/web)。

- [**エージェント用のブラウザ**](/settings?s=browser&find=A%20browser%20for%20agents)：エージェントがサイトを開き、クリックし、入力し、ページを読みます。
- [**Chromium**](/settings?s=browser&find=Chromium)：ブラウザが使うChromium。
- [**ウィンドウを表示**](/settings?s=browser&find=Show%20a%20window)：ブラウザを見えるウィンドウで実行。
- [**ページがこのマシンとそのネットワークに届かないようにする**](/settings?s=browser&find=Keep%20pages%20off%20this%20machine%20and%20its%20network)：このコンピューターとそのネットワーク上のサイトにはアクセスできません。
- [**画像を認識できるモデル向けのスクリーンショット**](/settings?s=browser&find=Screenshots%20for%20models%20that%20see%20images)：画像を認識できるモデルには、ページのスクリーンショットが渡されます。
- [**サイト**](/settings?s=browser&find=Sites)：これらのサイトのみ、またはこれらのサイトは常に除外。
- [**プロファイル**](/settings?s=browser&find=Profiles)：ブラウザ用の別々のサインイン。
- [**ログイン済みのサイトでの送信前に確認**](/settings?s=browser&find=Ask%20before%20sending%20on%20signed-in%20sites)：ログイン済みのサイトで、エージェントが送信、投稿、削除、送金を行う前。
- [**ブックマーク**](/settings?s=browser&find=Bookmarks)：自分のものと、このコンピューターの他のブラウザのものを統合。
- [**拡張機能**](/settings?s=browser&find=Extensions)：Chrome拡張機能（デスクトップアプリ）。
- [**ブラウザの設定**](/settings?s=browser&find=Browser%20settings)：ホームページ、検索エンジン、検索ショートカット、ページのズーム、スペルチェック、翻訳、ダークページ、広告ブロック、履歴、保存されたデータの消去。

### コンピューターの操作

[設定 → コンピューターの操作](/settings?s=computer)：デスクトップアプリで、エージェントが画面を見て、マウスとキーボードを使います。詳しくは[検索とブラウザ](/guide/web)。

- [**コンピューターの操作**](/settings?s=computer&find=Computer%20use)：エージェントが画面を見て、あらゆるアプリでマウスとキーボードを使います（ウェブサイトはブラウザ内に限ります）。セッションごとに先に確認します。
- [**アクセシビリティ**](/settings?s=computer&find=Accessibility)：Hydorがマウスとキーボードを使うためのmacOSの権限。
- [**画面収録**](/settings?s=computer&find=Screen%20Recording)：Hydorが画面を見るためのmacOSの権限。

### メモリ

[設定 → メモリ](/settings?s=memory)：あなたやプロジェクト、各セッションについてエージェントが覚えていることと、その書き込み日時。詳しくは[メモリ](/guide/memory)。

- [**メモリ**](/settings?s=memory&find=Memory)：エージェントは過去のセッションが残した内容を踏まえて始まり、頼むとメモを保存します。
- [**Wikiメモリ**](/settings?s=memory&find=Wiki%20memory)：エージェントがプロジェクトごとにドキュメントと作業内容から保つ記事。プロジェクト自体の設定で変えない限り、すべてのプロジェクトでオンです。
- [**新しいドキュメントから学習**](/settings?s=memory&find=Learn%20from%20new%20documents)：新規および変更されたドキュメントから、補助モデルがメモリのメモを追加し、Wikiを更新します。
- [**Wikiに読み込むドキュメントの上限数**](/settings?s=memory&find=Most%20documents%20to%20read%20into%20the%20wiki)：ドキュメントがこの数を超えると、プロジェクトのWikiはピン留め、最も使われたもの、最新のものを読み込みます。エージェントはすべてを検索できます。
- [**Wikiフォルダ**](/settings?s=memory&find=Wiki%20folder)：共有Wikiの保存場所。下で設定しない限り、プロジェクトのWikiも同じ場所です。
- [**プロジェクトのWiki**](/settings?s=memory&find=Project%20wikis)：各プロジェクトのWikiの保存場所：wikiフォルダ内、または各プロジェクトのフォルダ内。
- [**各プロジェクト内のフォルダ**](/settings?s=memory&find=Folder%20inside%20each%20project)：各プロジェクトのフォルダ内で、Wikiを保存する場所。
- [**Gitの対象から外す**](/settings?s=memory&find=Leave%20it%20out%20of%20Git)：プロジェクトのwikiフォルダを.gitignoreに追加します（Gitリポジトリのみ）。
- [**意味で検索**](/settings?s=memory&find=Search%20by%20meaning)：メモやこの検索内のあらゆるものを、意味で検索します。
- [**各エージェントが最初に受け取るメモ**](/settings?s=memory&find=Notes%20each%20agent%20starts%20with)：プロフィールに加えて、質問に関係するメモを最大この件数と、残りのメモのタイトルを渡します。
- [**自動で整理**](/settings?s=memory&find=Tidy%20up%20automatically)：新しい内容が増えたあと、1日に1回ほど、同じ内容のメモを統合し、関連するメモをまとめてタイトルを付けます。
- [**会話から学習**](/settings?s=memory&find=Learn%20from%20conversations)：整理と同時に、会話から誤りと分かったメモを訂正し、未確認のものを確認し、新しい内容を少し保存します。
- [**今すぐ整理**](/settings?s=memory&find=Tidy%20up%20now)：メモリをすぐに整理します。
- [**プロフィール**](/settings?s=memory&find=Your%20profile)：セッション開始時にすべてのエージェントに渡される、ユーザーについての情報。エージェントが最新の状態に保ちます。
- [**プロフィールの長さ**](/settings?s=memory&find=Profile%20length)：プロフィールの最大語数。超えると補助モデルが短くします。
- [**メモ**](/settings?s=memory&find=Notes)：保存されているすべてのメモを場所別に表示。
- [**メモを追加**](/settings?s=memory&find=Add%20a%20note)：ユーザーやプロジェクトについて、エージェントに覚えてもらうメモを書く。
- [**削除したメモ**](/settings?s=memory&find=Deleted%20notes)：過去30日間に削除されたメモ（復元できます）。
- [**取り込む…**](/settings?s=memory&find=Bring%20in%E2%80%A6)：他のアシスタントがあなたについて把握している内容のメモと、そこで作成したスキル：Claude Code、Codex、その他のエージェント、またはChatGPTやClaudeのエクスポート。
- [**エクスポート**](/settings?s=memory&find=Export)：すべてのメモを、読みやすいMarkdownまたは履歴付きのJSONで。
- [**すべて消去…**](/settings?s=memory&find=Clear%20all%E2%80%A6)：すべてのメモとその履歴を削除します。

### サブエージェント

[設定 → サブエージェント](/settings?s=children)：エージェントが作業の一部をサブエージェントに任せたり、難しい問題にスウォームで取り組んだりします。詳しくは[複数のエージェントによるディープリサーチとセカンドオピニオン](/guide/research)。

- [**セッションごとの同時作業数**](/settings?s=children&find=Working%20at%20once%2C%20per%20session)：1つのセッションが同時に実行するHydorサブエージェントの数。
- [**スウォームの規模**](/settings?s=children&find=Swarm%20size)：スウォームやキャンペーンのエージェントが同時に作業する数。

### 画像、動画、音声

[設定 → 画像、動画、音声](/settings?s=images)：エージェントがOpenRouter経由で作る画像、動画、音楽、音声と、そのキャプションを書く担当。詳しくは[ドキュメント、画像、動画、音声](/guide/documents-voice)。

- [**画像の生成**](/settings?s=images&find=Making%20images)：エージェントによる画像の生成を許可。
- [**ほとんどの画像向け（最高）**](/settings?s=images&find=For%20most%20pictures%20%28Best%29)：ほとんどの画像と、その変更をすべて作成するモデル。
- [**シンプルな画像向け（高速）**](/settings?s=images&find=For%20simple%20pictures%20%28Quick%29)：アイコン、背景、テクスチャ、シンプルな画像向けの、より安価で高速なモデル。
- [**このコンピューターの画像ツール**](/settings?s=images&find=Picture%20tools%20on%20this%20computer)：画像の背景を削除、一部を消去、または拡大します。ここで無料で行え、画像はこのコンピューターから出ません。
- [**動画の生成**](/settings?s=images&find=Making%20videos)：エージェントによる動画の生成を許可。
- [**動画モデル**](/settings?s=images&find=Video%20model)：動画を作成するモデル。
- [**動画の処理にグラフィックカードを使う**](/settings?s=images&find=Use%20the%20graphics%20card%20for%20videos)：グラフィックカードがある場合は、編集した動画をグラフィックカードで作成します：より高速で、プロセッサに余裕ができます。
- [**音声の生成**](/settings?s=images&find=Making%20audio)：エージェントによる音声の生成を許可。
- [**音楽モデル**](/settings?s=images&find=Music%20model)：音楽を作成するモデル。
- [**音声・サウンドモデル**](/settings?s=images&find=Voice%20and%20sound%20model)：音声と効果音を作成するモデル。
- [**保存したものの説明文**](/settings?s=images&find=Captions%20for%20what%20you%20keep)：保存した画像、動画、音声のタイトルと説明を書くモデル。

### 音声

[設定 → 音声](/settings?s=voice)：メッセージを音声で入力し、返信を読み上げさせます。詳しくは[ドキュメント、画像、動画、音声](/guide/documents-voice)。

- [**音声入力**](/settings?s=voice&find=Dictation)：入力する代わりに話してメッセージを送る。
- [**話す言語**](/settings?s=voice&find=Language%20you%20speak)：音声入力が聞き取る言語。
- [**サーバーでの音声認識**](/settings?s=voice&find=Speech%20recognition%20on%20the%20server)：このコンピューターまたはサービスで音声を認識します。
- [**読み上げ**](/settings?s=voice&find=Read%20aloud)：返信を読み上げる。

### 自分のエージェント

[設定 → 自分のエージェント](/settings?s=assistants)：タスクフォルダの保存先とタスク後の片付け。エージェント自体はエージェントページにあります。詳しくは[エージェント](/guide/agents)。

- [**自分のエージェント**](/settings?s=assistants&find=Your%20agents)：エージェントはエージェントページにあります。
- [**タスク後に片付ける**](/settings?s=assistants&find=Clean%20up%20after%20a%20task)：エージェントが作業の途中で作り、不要になったものを片付けます。
- [**タスクフォルダ**](/settings?s=assistants&find=Task%20folders)：フォルダなしで開始したセッションで、新しいタスクフォルダを作る場所。

### アプリ

[設定 → アプリ](/settings?s=apps)：確認なしでエージェントが実行してよいアプリ。詳しくは[アプリ](/guide/apps)。

- [**確認せずに実行**](/settings?s=apps&find=Run%20without%20asking)：エージェントが確認なしで実行するアプリ。1つ取り除くと、再び確認されます。

### Custom

[設定 → Custom](/settings?s=custom)：自動モード、コマンド用サンドボックス、ゴールの実行時間。詳しくは[Custom、アプリ独自のエージェント](/guide/custom)。

- [**自動モード**](/settings?s=custom&find=Auto%20mode)：Customは安全な手順を自動で承認します。
- [**コマンド用サンドボックス**](/settings?s=custom&find=Sandbox%20for%20commands)：自動モードのコマンドはサンドボックス内で実行されます。フルアクセスではサンドボックスなしで実行されます。
- [**ゴールが一時停止するまでのラウンド数**](/settings?s=custom&find=Rounds%20before%20a%20goal%20pauses)：新しいゴールが上限に達して止まるまでに実行できるラウンド数（全エージェント共通）。

## エージェントに質問

- 「エージェントの作業中にEnterで何が起きるかは、どこで変えられますか？」
- 「通知音をオンにして。」
- 「検索の設定を見せて。」
- 「補助モデルをいちばん安いものにして。」
- 「新しいセッションではメモリをオフにして。」
