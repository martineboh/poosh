import lodash from "lodash";
import escapeRegExp from "lodash/escapeRegExp";
import joinUrl from "poosh-common/lib/url/join";
import RemoteStatus from "poosh-common/lib/file/RemoteStatus";
import normalizeFileOptions from "./options/normalizeFileOptions";
import S3 from "./promisification/S3";
import S3Error from "./S3Error";
import S3ParamsProvider from "./S3ParamsProvider";
import { etagToMd5 } from "./helpers/convertion";
import { getStatusDetails, getStatusDetailsMissing } from "./helpers/status";

/**
 * @this RemoteClient
 * @private
 */
function listItemToFile(content) {

  const destBase = this.getBaseDestination();
  const relative = this._basePathRegex
    ? content.Key.replace(this._basePathRegex, "")
    : content.Key;

  return {
    dest : {
      base : destBase,
      relative,
      absolute : joinUrl(destBase, relative)
    },
    content : {
      md5 : etagToMd5(content.ETag),
      size : content.Size
    },
    remote : {
      storageClass : content.StorageClass
    }
  };
}

export default class RemoteClient {

  /**
   * @params remoteOptions Remote options.
   */
  constructor(options: Object) {
    this._options = options;
    this._paramsProvider = new S3ParamsProvider(this._options);
    this._s3 = new S3(this._paramsProvider.getConstructorOptions());
    this._deleteBuffer = [];

    if (this._options.basePath) {
      const basePath = escapeRegExp(this._options.basePath);
      this._basePathRegex = new RegExp(`^(${basePath}/)`);
    }
  }

  /**
   * Indicates that remote client is not able to make separate updates for
   * content, headers and remote options.
   */
  get rough() {
    return true;
  }

  /**
   * @param file
   * @returns
   */
  async getStatus(file: Object): Object {

    const params = this._paramsProvider.getHeadObjectParams(file);
    let result;
    try {
      result = await this._s3.headObjectAsync(params);
    } catch (error) {
      if (error.code !== "NotFound") {
        throw new S3Error(error);
      }

      return {
        status : RemoteStatus.Missing,
        statusDetails : getStatusDetailsMissing()
      };
    }

    const details = getStatusDetails(file, result);

    return {
      status : details.content === RemoteStatus.Same
        && details.headers === RemoteStatus.Same
        && details.remote === RemoteStatus.Same
          ? RemoteStatus.Same
          : RemoteStatus.Different,
      statusDetails : details
    };
  }

  /**
   * Upload a file.
   *
   * @param file
   */
  async upload(file: Object) {

    if (file.dest.statusDetails && file.dest.statusDetails.content === RemoteStatus.Same) {
      // If content has not changed, we can simply do a fast "self copy"
      const params = this._paramsProvider.getSelfCopyObjectParams(file);
      await this._s3.copyObjectAsync(params);
      return;
    }

    const params = this._paramsProvider.getPutObjectParams(file);
    await this._s3.putObjectAsync(params);
  }

  /**
   * List remote files.
   *
   * @param iteratee The function invoked per iteration.
   * Iteratee functions may exit iteration early by explicitly returning false.
   */
  async list(iteratee: Function) {

    let nextMarker = null;
    do {

      const params = this._paramsProvider.getListObjectsParams(this._options);
      params.Marker = nextMarker;

      let data;
      try {
        data = await this._s3.listObjectsAsync(params);
      } catch (error) {
        throw new S3Error(error);
      }

      for (const content of data.Contents) {
        const file = this::listItemToFile(content);

        // Iteratee may exit iteration early by explicitly returning false
        if (await iteratee(file) === false) {
          return;
        }
      }

      nextMarker = data.IsTruncated
        ? data.NextMarker || lodash.chain(data.Contents).last().get("Key").value()
        : null;

    } while (nextMarker);
  }

  /**
   * @param file
   * @returns Files that has been deleted. Or undefined if not.
   */
  async pushDelete(file: Object): Array<Object> {

    const deleteBuffer = this._deleteBuffer;
    deleteBuffer.push(file);

    return deleteBuffer.length >= 1000
      ? this.flushDelete() // Auto flush
      : undefined;
  }

 /**
  * Flush remaining deletions.
  *
  * @returns Files that has been deleted. Or undefined if not.
  */
  async flushDelete() {

    const files = this._deleteBuffer;
    if (!files.length) {
      return undefined;
    }

    const params = this._paramsProvider.getDeleteObjectsParams(files);
    await this._s3.deleteObjectsAsync(params);
    this._deleteBuffer = [];

    return files;
  }

  /**
   * Get base destination URL. Will be used to identify the file.
   * Note: This method doesn't make any request to remote host.
   *
   * @returns The remote base path.
   */
  getBaseDestination(): string {
    return joinUrl(
      this._s3.endpoint.hostname,
      this._options.bucket,
      this._options.basePath);
  }

  /**
   * Validate and normalize file remote options.
   * Note: This method doesn't make any request to remote host.
   *
   * @param options File's remote options.
   * @return Normalized options.
   * @throws PooshError
   */
  normalizeFileRemoteOptions(options) {
    return normalizeFileOptions(options);
  }

}
