const TOS_PART1 = `⚠️ EzBet Casino Bot Terms of Service

By accessing or using the EzBet Casino Bot, you agree to comply with these Terms of Service. These terms may be updated periodically, and continued use of the bot constitutes acceptance of any changes. It is your responsibility to review them regularly. Failure to comply may result in restrictions or account suspension. Please gamble responsibly.

**1. Prohibited Activities & Behavior**
1.1 Illegal Activity: The use of this bot for any illegal activities, including but not limited to money laundering or fraud, is strictly prohibited.
1.2 Exploitation of Bugs: Attempting to exploit bugs, vulnerabilities, or unintended mechanics is prohibited. Users are expected to report any issues to support.
1.3 Abuse & Misconduct: Harassment, scams, doxxing, hacking, or any form of harmful behavior toward other users or the platform is strictly prohibited.
1.4 Advertising: Unauthorized promotion of external services, communities, or competing platforms is not allowed.
1.5 Disruptive Behavior: Repeatedly engaging in disruptive or non-cooperative behavior, or ignoring administrator instructions, may result in restrictions.

**2. Account Management & Platform Authority**
2.1 Fair Use: Any attempt to manipulate, abuse, or unfairly gain advantage within the system may result in account restrictions or permanent suspension.
2.2 Account Adjustments: We reserve the right to adjust balances, statistics, or account data in cases of verified rule violations, abuse, or technical errors. Such actions will only be taken when reasonably necessary to maintain fairness and platform integrity.
2.3 Technical Issues: In the event of system errors, delays, or malfunctions, we may temporarily restrict or adjust accounts to resolve inconsistencies.
2.4 Account Suspension: Accounts found in violation of these terms may be suspended or restricted. Access to funds may be temporarily limited during investigation.

**3. Deposits & Withdrawals**
3.1 Minimum Limits: Minimum Deposit: 0.0005 LTC (5 points). Minimum Withdrawal: 0.0020 LTC (20 points).
3.2 Supported Cryptocurrency: We primarily support Litecoin (LTC) for deposits and withdrawals. Litecoin deposits are processed without platform fees, while withdrawals may include a service fee of 2%.
3.3 Alternative Cryptocurrencies: Use of cryptocurrencies other than Litecoin is not guaranteed and may involve additional risks, including fluctuating exchange rates, network fees, or third-party conversion costs. The platform is not responsible for losses resulting from such factors.
3.4 Transaction Finality: Cryptocurrency transactions are irreversible. Users are responsible for ensuring the accuracy of deposit and withdrawal details.`;

const TOS_PART2 = `**4. Gameplay, Refunds & Bonuses**
4.1 Game Outcomes: All game results are final once processed. Users are responsible for ensuring stable connectivity and proper interaction during gameplay.
4.2 No Refund Policy: Refunds are not provided for completed games, including cases of user-side issues such as disconnections, delays, or timeouts.
4.3 Bonuses & Rakeback: Bonuses, rakeback, and promotional features are provided at the platform's discretion and may vary based on game mechanics. These features are not guaranteed and may be modified, limited, or discontinued at any time.
4.4 Balance Handling: Balances and wagers may be subject to rounding or truncation rules as defined by the system.

**5. Liability & Platform Governance**
5.1 Limitation of Liability: To the fullest extent permitted by applicable law, EzBet, its developers, and administrators shall not be liable for any direct, indirect, incidental, or consequential damages arising from the use of this bot.
5.2 Service Availability: We do not guarantee uninterrupted or error-free operation of the bot. Maintenance, updates, or unexpected issues may affect availability.
5.3 Platform Governance: We reserve the right to moderate, restrict, or suspend access to ensure a fair and secure environment for all users.
5.4 User Responsibility: By using this bot, you acknowledge that participation is voluntary and that you are responsible for your actions and decisions.

**6. Support & Legal Compliance**
6.1 Support: Users must contact support for issues or disputes. Actions taken without prior clarification may not be reversible.
6.2 Age Requirement: Users must be at least 18 years old and legally permitted to engage in gambling-related activities in their jurisdiction.
6.3 Jurisdiction: Users are responsible for ensuring that their use of this bot complies with all applicable local laws and regulations.
6.4 Entertainment Purpose: This bot is intended for entertainment purposes only. No guarantees of profit or financial gain are made.`;

function TOS_EMBEDS(title = 'Terms of Service', footer = 'EzBet Casino') {
  return [
    { title: `${title} (1/2)`, description: TOS_PART1, footer },
    { title: `${title} (2/2)`, description: TOS_PART2, footer }
  ];
}

module.exports = { TOS_PART1, TOS_PART2, TOS_EMBEDS };
