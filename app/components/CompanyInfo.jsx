import styles from '../page.module.css';

export default function CompanyInfo({ company }) {
  return (
    <div className={styles.companyInfo}>
      <h2>{company.corp_name}</h2>
      <p>고유코드: {company.corp_code} {company.stock_code ? `| 종목코드: ${company.stock_code}` : ''}</p>
    </div>
  );
}
